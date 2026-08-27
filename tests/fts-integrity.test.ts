import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

type D1Result = {
  results: Array<Record<string, string | number>>;
  success: boolean;
};

const root = fileURLToPath(new URL("..", import.meta.url));
const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const config = path.join(root, "wrangler.example.jsonc");

function messageUpsert(
  id: string,
  telegramMessageId: number,
  plainText: string,
  mediaTitle: string,
  mediaDescription: string,
): string {
  const media = JSON.stringify([{ title: mediaTitle, description: mediaDescription }]);
  return `INSERT INTO messages (
    id, channel_id, origin_channel_id, telegram_message_id, source_url, date,
    published_at, published_year, published_month, plain_text, media
  ) VALUES (
    '${id}', 'test-channel', 'test-channel', ${telegramMessageId},
    'https://t.me/test/${telegramMessageId}', '2026-08-27', 1787788800,
    '2026', '2026-08', '${plainText}', '${media.replaceAll("'", "''")}'
  ) ON CONFLICT(id) DO UPDATE SET
    channel_id = excluded.channel_id,
    origin_channel_id = excluded.origin_channel_id,
    telegram_message_id = excluded.telegram_message_id,
    source_url = excluded.source_url,
    date = excluded.date,
    published_at = excluded.published_at,
    published_year = excluded.published_year,
    published_month = excluded.published_month,
    plain_text = excluded.plain_text,
    media = excluded.media;`;
}

test("Local D1 keeps messages and FTS one-to-one across import lifecycle", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "geekshare-fts-"));
  const persistence = path.join(temporary, "d1");
  const xdgConfig = path.join(temporary, "xdg");
  mkdirSync(xdgConfig, { recursive: true });

  const execute = (args: string[]): D1Result[] => {
    const result = spawnSync(
      process.execPath,
      [
        wrangler,
        "d1",
        "execute",
        "geekshare-archive",
        "--local",
        "--persist-to",
        persistence,
        "--config",
        config,
        ...args,
        "--json",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, XDG_CONFIG_HOME: xdgConfig },
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    if (result.status !== 0) {
      throw new Error([result.stderr, result.stdout].filter(Boolean).join("\n"));
    }
    return JSON.parse(result.stdout) as D1Result[];
  };

  const query = (sql: string): Array<Record<string, string | number>> =>
    execute(["--command", sql])[0].results;

  const integrity = () => {
    const results = execute([
      "--command",
      [
        "SELECT COUNT(*) AS count FROM messages",
        "SELECT COUNT(*) AS count FROM messages_fts",
        "SELECT COUNT(DISTINCT id) AS count FROM messages_fts",
        "SELECT id, COUNT(*) AS count FROM messages_fts GROUP BY id HAVING COUNT(*) > 1",
      ].join("; "),
    ]);
    return {
      messages: results[0].results[0].count,
      fts: results[1].results[0].count,
      distinctFts: results[2].results[0].count,
      duplicates: results[3].results,
    };
  };

  try {
    const baseSchema = ["0001_initial.sql", "0002_admin_content_management.sql", "0003_content_discovery.sql"]
      .map((file) => readFileSync(path.join(root, "migrations", file), "utf8"))
      .join("\n");
    const schemaPath = path.join(temporary, "base-schema.sql");
    writeFileSync(schemaPath, baseSchema);
    execute(["--file", schemaPath]);

    const importSql = [
      `INSERT INTO channels (
        id, slug, title, username, telegram_url, archive_url
      ) VALUES (
        'test-channel', 'test-channel', 'Test Channel', 'testchannel',
        'https://t.me/testchannel', '/channel/test-channel'
      ) ON CONFLICT(id) DO UPDATE SET title = excluded.title;`,
      messageUpsert("message-a", 1, "old unique phrase", "old media title", "old media description"),
      messageUpsert("message-b", 2, "second unique phrase", "second media title", "second media description"),
    ].join("\n");
    const importPath = path.join(temporary, "import.sql");
    writeFileSync(importPath, importSql);

    execute(["--file", importPath]);
    assert.deepEqual(integrity(), {
      messages: 2,
      fts: 2,
      distinctFts: 2,
      duplicates: [],
    });

    execute(["--file", importPath]);
    assert.deepEqual(integrity(), {
      messages: 2,
      fts: 2,
      distinctFts: 2,
      duplicates: [],
    });

    execute([
      "--command",
      messageUpsert("message-a", 1, "new unique phrase", "new media title", "new media description"),
    ]);
    assert.deepEqual(query("SELECT COUNT(*) AS count FROM messages_fts WHERE id = 'message-a'"), [
      { count: 1 },
    ]);
    assert.deepEqual(query("SELECT id FROM messages_fts WHERE messages_fts MATCH '\"old unique phrase\"'"), []);
    assert.deepEqual(query("SELECT id FROM messages_fts WHERE messages_fts MATCH '\"new unique phrase\"'"), [
      { id: "message-a" },
    ]);
    assert.deepEqual(
      query("SELECT media_title, media_description FROM messages_fts WHERE id = 'message-a'"),
      [{ media_title: "new media title", media_description: "new media description" }],
    );

    assert.throws(
      () => execute([
        "--command",
        messageUpsert("different-archive-id", 1, "collision", "collision", "collision"),
      ]),
      /UNIQUE constraint failed/,
    );

    execute(["--command", "DELETE FROM messages WHERE id = 'message-b'"]);
    assert.deepEqual(integrity(), {
      messages: 1,
      fts: 1,
      distinctFts: 1,
      duplicates: [],
    });

    execute([
      "--command",
      `INSERT INTO messages_fts(id, plain_text, media_title, media_description)
       SELECT id, plain_text, media_title, media_description
       FROM messages_fts WHERE id = 'message-a'`,
    ]);
    assert.deepEqual(integrity(), {
      messages: 1,
      fts: 2,
      distinctFts: 1,
      duplicates: [{ id: "message-a", count: 2 }],
    });

    execute(["--file", path.join(root, "migrations", "0004_rebuild_messages_fts.sql")]);
    assert.deepEqual(integrity(), {
      messages: 1,
      fts: 1,
      distinctFts: 1,
      duplicates: [],
    });

    const exportSource = readFileSync(path.join(root, "scripts", "export-d1.ts"), "utf8");
    assert.doesNotMatch(exportSource, /INSERT OR REPLACE INTO messages/);
    assert.match(exportSource, /ON CONFLICT\(id\) DO UPDATE SET/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
