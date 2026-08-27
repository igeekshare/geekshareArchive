import { PrismaClient } from "@prisma/client";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sanitizeHtml from "sanitize-html";

type JsonMedia = {
  type: "photo" | "video" | "file";
  url: string;
  thumb?: string;
  title?: string;
  description?: string;
};

type JsonMessage = {
  id: string;
  media?: JsonMedia | null;
};

const prisma = new PrismaClient();
const root = process.cwd();
const outputDirectory = path.join(root, ".data");
const sqlPath = path.join(outputDirectory, "d1-import.sql");
const mediaManifestPath = path.join(outputDirectory, "r2-files.txt");
const mediaDirectories = ["photos", "video_files", "stickers"];

const allowedTags = [
  "a",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "code",
  "pre",
  "blockquote",
  "br",
  "span",
];

function sql(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sanitizeTelegramHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags,
    allowedAttributes: {
      a: ["href", "title", "rel"],
      span: ["class"],
    },
    allowedSchemes: ["http", "https", "tg", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: {
          ...attributes,
          rel: "noopener noreferrer",
        },
      }),
    },
  });
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function plainText(html: string): string {
  return decodeEntities(
    sanitizeHtml(html.replace(/<br\s*\/?>/gi, "\n"), {
      allowedTags: [],
      allowedAttributes: {},
    }),
  ).replace(/\s+\n/g, "\n").trim();
}

function parseLegacyDate(value: string, datetime?: string | null): {
  publishedAt: number;
  iso: string;
  date: string;
  year: string;
  month: string;
} {
  const legacy = value.match(
    /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2}:\d{2})(?:\s+UTC([+-]\d{2}:\d{2}))?/,
  );
  const candidate = legacy
    ? `${legacy[3]}-${legacy[2]}-${legacy[1]}T${legacy[4]}${legacy[5] ?? "+08:00"}`
    : datetime ?? value;
  const parsed = new Date(candidate);
  const safe = Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
  const inShanghai = new Date(safe.getTime() + 8 * 60 * 60 * 1000);
  const year = String(inShanghai.getUTCFullYear());
  const monthNumber = String(inShanghai.getUTCMonth() + 1).padStart(2, "0");
  const day = String(inShanghai.getUTCDate()).padStart(2, "0");
  return {
    publishedAt: Math.floor(safe.getTime() / 1000),
    iso: candidate,
    date: `${year}-${monthNumber}-${day}`,
    year,
    month: `${year}-${monthNumber}`,
  };
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isLocalMedia(value: string): boolean {
  return !/^https?:\/\//i.test(value);
}

function normalizeMedia(value: JsonMedia | JsonMedia[] | null | undefined): Array<Record<string, unknown>> {
  const source = Array.isArray(value) ? value[0] : value;
  if (!source?.url) return [];
  const local = isLocalMedia(source.url);
  const telegramRemote = /^https?:\/\/(?:t\.me|telegram\.|[^/]*telegram[^/]*)/i.test(source.url);
  return [
    {
      type: source.type,
      ...(local ? { r2Key: source.url.replace(/^\//, "") } : { sourceUrl: source.url }),
      ...(source.thumb && isLocalMedia(source.thumb)
        ? { thumbKey: source.thumb.replace(/^\//, "") }
        : {}),
      ...(source.title ? { title: source.title } : {}),
      ...(source.description ? { description: source.description } : {}),
      archiveStatus: local ? "archived" : telegramRemote ? "failed" : "external",
    },
  ];
}

function extractTags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]{1,64})/gu)) {
    tags.add(match[1].toLocaleLowerCase());
  }
  return [...tags];
}

async function listFilesAt(absolute: string, keyPrefix: string): Promise<string[]> {
  const entries = await readdir(absolute, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const files: string[] = [];
  for (const entry of entries) {
    const key = keyPrefix ? path.posix.join(keyPrefix, entry.name) : entry.name;
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) files.push(...(await listFilesAt(child, key)));
    else if (entry.isFile()) files.push(key);
  }
  return files;
}

async function main() {
  const [channels, messages, logs, jsonMessages] = await Promise.all([
    prisma.channel.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.message.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.syncLog.findMany({ orderBy: { startedAt: "asc" } }),
    readFile(path.join(root, "src", "data", "messages.json"), "utf8").then(
      (value) => JSON.parse(value) as JsonMessage[],
    ),
  ]);
  const jsonById = new Map(jsonMessages.map((message) => [message.id, message]));
  const statements: string[] = [
    "-- Generated by npm run db:export-d1. Apply migrations before importing.",
    "PRAGMA foreign_keys = ON;",
  ];

  for (const channel of channels) {
    const username = channel.username ?? channel.id;
    statements.push(
      `INSERT INTO channels (` +
        `id, slug, title, username, telegram_chat_id, telegram_url, archive_url, ` +
        `description, avatar_key, enabled, last_synced_at, last_webhook_at, ` +
        `last_synced_message_id, created_at, updated_at) VALUES (` +
        [
          channel.id,
          channel.slug,
          channel.title,
          username,
          null,
          channel.telegramUrl ?? `https://t.me/${username}`,
          channel.archiveUrl ?? `/channel/${channel.id}`,
          channel.description,
          channel.avatarUrl && isLocalMedia(channel.avatarUrl)
            ? channel.avatarUrl.replace(/^\//, "")
            : null,
          channel.enabled ? 1 : 0,
          channel.lastSyncedAt?.toISOString() ?? null,
          null,
          channel.lastSyncedMessageId ? Number(channel.lastSyncedMessageId) : null,
          channel.createdAt.toISOString(),
          channel.updatedAt.toISOString(),
        ]
          .map(sql)
          .join(", ") +
        `) ON CONFLICT(id) DO UPDATE SET ` +
        `slug = excluded.slug, title = excluded.title, username = excluded.username, ` +
        `telegram_chat_id = COALESCE(channels.telegram_chat_id, excluded.telegram_chat_id), ` +
        `telegram_url = excluded.telegram_url, archive_url = excluded.archive_url, ` +
        `description = excluded.description, avatar_key = COALESCE(excluded.avatar_key, channels.avatar_key), ` +
        `enabled = excluded.enabled, last_synced_at = COALESCE(excluded.last_synced_at, channels.last_synced_at), ` +
        `last_synced_message_id = COALESCE(excluded.last_synced_message_id, channels.last_synced_message_id), ` +
        `updated_at = excluded.updated_at;`,
    );
  }

  let failedMedia = 0;
  for (const message of messages) {
    const fallback = jsonById.get(message.id);
    const dbMedia = parseJson<JsonMedia | JsonMedia[] | null>(message.media, null);
    const media = normalizeMedia(fallback?.media ?? dbMedia);
    if (media.some((item) => item.archiveStatus === "failed")) failedMedia += 1;
    const html = sanitizeTelegramHtml(message.text);
    const text = plainText(html);
    const time = parseLegacyDate(message.date, message.datetime);
    const telegramMessageId = Number(
      message.telegramMessageId ?? message.id.match(/(\d+)$/)?.[1] ?? 0,
    );
    const status = media[0]?.archiveStatus ?? "none";
    statements.push(
      `INSERT INTO messages (` +
        `id, channel_id, origin_channel_id, telegram_message_id, source_url, date, datetime, published_at, ` +
        `published_year, published_month, sender, html, plain_text, media, reply_to, ` +
        `reactions, raw_payload, media_archive_status, status, admin_override, ` +
        `admin_updated_at, admin_updated_by, display_title, display_summary, is_featured, ` +
        `featured_order, engagement_score, created_at, updated_at) VALUES (` +
        [
          message.id,
          message.channelId,
          message.channelId,
          telegramMessageId,
          message.sourceUrl ?? `https://t.me/${message.channelId}/${telegramMessageId}`,
          time.date,
          time.iso,
          time.publishedAt,
          time.year,
          time.month,
          message.from,
          html,
          text,
          JSON.stringify(media),
          message.replyTo,
          message.reactions ?? "[]",
          "{}",
          status,
          message.status ?? "published",
          0,
          null,
          null,
          null,
          null,
          0,
          0,
          0,
          message.createdAt.toISOString(),
          message.updatedAt.toISOString(),
        ]
          .map(sql)
          .join(", ") +
        `) ON CONFLICT(id) DO UPDATE SET ` +
        `channel_id = excluded.channel_id, origin_channel_id = excluded.origin_channel_id, ` +
        `telegram_message_id = excluded.telegram_message_id, source_url = excluded.source_url, ` +
        `date = excluded.date, datetime = excluded.datetime, published_at = excluded.published_at, ` +
        `published_year = excluded.published_year, published_month = excluded.published_month, ` +
        `sender = excluded.sender, html = excluded.html, plain_text = excluded.plain_text, ` +
        `media = excluded.media, reply_to = excluded.reply_to, reactions = excluded.reactions, ` +
        `raw_payload = excluded.raw_payload, media_archive_status = excluded.media_archive_status, ` +
        `status = excluded.status, admin_override = excluded.admin_override, ` +
        `admin_updated_at = excluded.admin_updated_at, admin_updated_by = excluded.admin_updated_by, ` +
        `display_title = excluded.display_title, display_summary = excluded.display_summary, ` +
        `is_featured = excluded.is_featured, featured_order = excluded.featured_order, ` +
        `engagement_score = excluded.engagement_score, created_at = excluded.created_at, ` +
        `updated_at = excluded.updated_at;`,
    );
    for (const tag of extractTags(text)) {
      statements.push(
        `INSERT OR IGNORE INTO message_tags(message_id, tag) VALUES (${sql(message.id)}, ${sql(tag)});`,
      );
    }
  }

  for (const log of logs) {
    statements.push(
      `INSERT INTO sync_logs(channel_id, source, status, message, details, created_at) VALUES (` +
        [
          log.channelId,
          log.source,
          log.status,
          log.message ?? log.errorMessage,
          JSON.stringify({
            imported: log.importedCount,
            updated: log.updatedCount,
            skipped: log.skippedCount,
            parsed: log.parsedCount,
            failed: log.failedCount,
          }),
          log.startedAt.toISOString(),
        ]
          .map(sql)
          .join(", ") +
        ");",
    );
  }

  const files = (
    await Promise.all([
      ...mediaDirectories.map((directory) =>
        listFilesAt(path.join(root, "public", directory), directory),
      ),
      listFilesAt(path.join(root, ".data", "r2"), ""),
    ])
  )
    .flat()
    .sort();
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(sqlPath, `${statements.join("\n")}\n`),
    writeFile(mediaManifestPath, `${files.join("\n")}\n`),
  ]);
  console.log(`D1 SQL: ${path.relative(root, sqlPath)} (${messages.length} messages)`);
  console.log(`R2 manifest: ${path.relative(root, mediaManifestPath)} (${files.length} files)`);
  console.log(`Remote Telegram media requiring retry: ${failedMedia}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
