import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { handleApi } from "../src/cloudflare/api";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  Env,
  ExecutionContextLike,
  R2Bucket,
} from "../src/cloudflare/runtime";
import type { TelegramUpdate } from "../src/cloudflare/telegram";

const root = fileURLToPath(new URL("..", import.meta.url));
export const ALL_MIGRATIONS = [
  "0001_initial.sql",
  "0002_admin_content_management.sql",
  "0003_content_discovery.sql",
  "0004_rebuild_messages_fts.sql",
  "0005_webhook_media_reliability.sql",
] as const;

type FailureRule = {
  match: (query: string) => boolean;
  remaining: number;
  message: string;
};

class LocalStatement implements D1PreparedStatement {
  private values: SQLInputValue[] = [];

  constructor(
    private readonly owner: LocalD1,
    readonly query: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values as SQLInputValue[];
    return this;
  }

  async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const row = this.owner.sqlite.prepare(this.query).get(...this.values) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (columnName ? row[columnName] : { ...row }) as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return {
      results: (this.owner.sqlite.prepare(this.query).all(...this.values) as Record<string, unknown>[])
        .map((row) => ({ ...row }) as T),
      success: true,
      meta: {},
    };
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    this.owner.executed.push(this.query);
    this.owner.maybeFail(this.query);
    const result = this.owner.sqlite.prepare(this.query).run(...this.values);
    return {
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
}

export class LocalD1 implements D1Database {
  readonly sqlite = new DatabaseSync(":memory:");
  readonly executed: string[] = [];
  private readonly failures: FailureRule[] = [];

  constructor(migrations: readonly string[] = ALL_MIGRATIONS) {
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    for (const migration of migrations) this.applyMigration(migration);
  }

  applyMigration(file: string): void {
    this.sqlite.exec(readFileSync(`${root}/migrations/${file}`, "utf8"));
  }

  prepare(query: string): D1PreparedStatement {
    return new LocalStatement(this, query);
  }

  async batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.sqlite.exec("BEGIN");
    try {
      const results: D1Result<T>[] = [];
      for (const statement of statements) results.push(await statement.run<T>());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  failOnce(match: (query: string) => boolean, message: string): void {
    this.failures.push({ match, remaining: 1, message });
  }

  maybeFail(query: string): void {
    const failure = this.failures.find((candidate) => candidate.remaining > 0 && candidate.match(query));
    if (!failure) return;
    failure.remaining -= 1;
    throw new Error(failure.message);
  }

  countExecuted(fragment: string): number {
    return this.executed.filter((query) => query.includes(fragment)).length;
  }

  row<T extends Record<string, unknown>>(query: string, ...values: unknown[]): T {
    const row = this.sqlite.prepare(query).get(...values as SQLInputValue[]) as T | undefined;
    assert.ok(row, `Expected row for ${query}`);
    return { ...row };
  }

  scalar(query: string, ...values: unknown[]): number {
    return Number(this.row<{ value: number }>(query, ...values).value);
  }
}

export class LocalContext implements ExecutionContextLike {
  readonly promises: Promise<unknown>[] = [];

  waitUntil(promise: Promise<unknown>): void {
    this.promises.push(promise);
  }

  async settle(): Promise<void> {
    await Promise.allSettled(this.promises);
  }
}

export class LocalMedia implements R2Bucket {
  readonly keys = new Set<string>();
  readonly heads: string[] = [];
  readonly puts: string[] = [];
  private readonly putFailures: Array<{ match: (key: string) => boolean; remaining: number }> = [];

  failNextPut(match: (key: string) => boolean): void {
    this.putFailures.push({ match, remaining: 1 });
  }

  async head(key: string) {
    this.heads.push(key);
    return this.keys.has(key) ? { key, size: 5 } : null;
  }

  async put(key: string) {
    this.puts.push(key);
    const failure = this.putFailures.find((candidate) => candidate.remaining > 0 && candidate.match(key));
    if (failure) {
      failure.remaining -= 1;
      throw new Error(`Forced R2 PUT failure for ${key}`);
    }
    this.keys.add(key);
    return { key, size: 5 };
  }

  async delete(keyOrKeys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]) this.keys.delete(key);
  }
}

export function createTestEnv(
  channels: Array<{ id: string; username: string; chatId: string }> = [
    { id: "geekshare", username: "xgeekshare", chatId: "-1001" },
  ],
): { db: LocalD1; media: LocalMedia; env: Env } {
  const db = new LocalD1();
  for (const channel of channels) {
    db.sqlite.prepare(
      `INSERT INTO channels (
         id, slug, title, username, telegram_chat_id, telegram_url, archive_url, enabled
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    ).run(
      channel.id,
      channel.id,
      channel.id,
      channel.username,
      channel.chatId,
      `https://t.me/${channel.username}`,
      `/channel/${channel.id}`,
    );
  }
  const media = new LocalMedia();
  const env = {
    DB: db,
    MEDIA: media,
    ASSETS: { fetch: async () => new Response("asset") },
    SITE_URL: "https://archive.example.com",
    MEDIA_BASE_URL: "https://media.example.com",
    ENVIRONMENT: "test",
    CF_ACCESS_ADMIN_EMAIL: "admin@example.com",
    TELEGRAM_BOT_TOKEN: "token",
    TELEGRAM_WEBHOOK_SECRET: "secret",
  } as Env;
  return { db, media, env };
}

export function messageUpdate(
  updateId: number,
  text: string,
  options: {
    messageId?: number;
    chatId?: number;
    username?: string;
    edited?: boolean;
    photo?: boolean;
    replyToMessageId?: number;
  } = {},
): TelegramUpdate {
  const message = {
    message_id: options.messageId ?? 7,
    date: 1_700_000_000,
    ...(options.edited ? { edit_date: 1_700_000_100 } : {}),
    chat: {
      id: options.chatId ?? -1001,
      title: "Channel",
      username: options.username ?? "xgeekshare",
      type: "channel",
    },
    text,
    ...(options.replyToMessageId
      ? { reply_to_message: { message_id: options.replyToMessageId } }
      : {}),
    ...(options.photo
      ? { photo: [{ file_id: "photo-file", file_unique_id: "photo-unique", file_size: 100 }] }
      : {}),
  };
  return options.edited
    ? { update_id: updateId, edited_channel_post: message }
    : { update_id: updateId, channel_post: message };
}

export function reactionUpdate(updateId: number, messageId = 7): TelegramUpdate {
  return {
    update_id: updateId,
    message_reaction_count: {
      chat: { id: -1001, username: "xgeekshare", type: "channel" },
      message_id: messageId,
      date: 1_700_000_200,
      reactions: [{ type: { type: "emoji", emoji: "🔥" }, total_count: 3 }],
    },
  };
}

function webhookRequest(update: TelegramUpdate): Request {
  return new Request("https://archive.example.com/api/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "secret",
    },
    body: JSON.stringify(update),
  });
}

export async function deliver(
  env: Env,
  update: TelegramUpdate,
  useContext = false,
): Promise<{ response: Response; context: LocalContext }> {
  const context = new LocalContext();
  const response = await handleApi(webhookRequest(update), env, useContext ? context : undefined);
  return { response, context };
}

export function telegramFetch(options: {
  failGetFile?: (fileId: string) => boolean;
  oversized?: (fileId: string) => boolean;
} = {}): {
  handler: typeof fetch;
  getFileIds: string[];
} {
  const getFileIds: string[] = [];
  const handler = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const payload = typeof init?.body === "string"
      ? JSON.parse(init.body) as { file_id?: string }
      : {};
    if (url.endsWith("/getWebhookInfo")) {
      return Response.json({ ok: true, result: { url: "https://archive.example.com/api/telegram/webhook" } });
    }
    if (url.endsWith("/getFile")) {
      const fileId = payload.file_id ?? "";
      getFileIds.push(fileId);
      if (options.failGetFile?.(fileId)) {
        return Response.json({ ok: false, description: `Forced getFile failure for ${fileId}` }, { status: 500 });
      }
      const extension = fileId.includes("document") ? "pdf" : "jpg";
      return Response.json({
        ok: true,
        result: {
          file_path: `files/${fileId}.${extension}`,
          file_size: options.oversized?.(fileId) ? 20 * 1024 * 1024 + 1 : 100,
        },
      });
    }
    if (url.includes("?embed=1")) {
      return new Response(
        '<a class="tgme_widget_message_photo_wrap" style="background-image:url(\'https://cdn.example/large.webp\')"></a>',
      );
    }
    if (url.includes("/file/bot") || url.startsWith("https://cdn.example/")) {
      return new Response("bytes", {
        headers: { "Content-Type": url.endsWith(".pdf") ? "application/pdf" : "image/jpeg", "Content-Length": "5" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
  return { handler, getFileIds };
}
