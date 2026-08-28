import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ALL_MIGRATIONS, LocalD1 } from "./cloudflare-test-helpers";

const root = fileURLToPath(new URL("..", import.meta.url));
const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");

function columns(db: LocalD1, table: string): string[] {
  return (db.sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(({ name }) => name);
}

test("fresh schema applies webhook lease and media retry migration", () => {
  const db = new LocalD1();
  assert.deepEqual(
    columns(db, "webhook_updates").filter((name) => ["attempt_count", "last_attempt_at"].includes(name)),
    ["attempt_count", "last_attempt_at"],
  );
  assert.deepEqual(
    columns(db, "messages").filter((name) => [
      "media_retry_count",
      "media_last_error",
      "media_next_retry_at",
      "media_retry_exhausted",
    ].includes(name)),
    ["media_retry_count", "media_last_error", "media_next_retry_at", "media_retry_exhausted"],
  );
  assert.ok(
    (db.sqlite.prepare("PRAGMA index_list(webhook_updates)").all() as Array<{ name: string }>)
      .some(({ name }) => name === "webhook_updates_claim_idx"),
  );
  assert.ok(
    (db.sqlite.prepare("PRAGMA index_list(messages)").all() as Array<{ name: string }>)
      .some(({ name }) => name === "messages_media_retry_queue_idx"),
  );
});

test("0005 upgrades an existing 0001-0004 database without losing messages, FTS, or webhook history", () => {
  const db = new LocalD1(ALL_MIGRATIONS.slice(0, 4));
  db.sqlite.exec(`
    INSERT INTO channels (
      id, slug, title, username, telegram_url, archive_url
    ) VALUES (
      'geekshare', 'geekshare', 'GeekShare', 'xgeekshare',
      'https://t.me/xgeekshare', '/channel/geekshare'
    );
    INSERT INTO messages (
      id, channel_id, origin_channel_id, telegram_message_id, source_url, date,
      published_at, published_year, published_month, plain_text, media_archive_status
    ) VALUES (
      'message7', 'geekshare', 'geekshare', 7, 'https://t.me/xgeekshare/7',
      '2023-11-15', 1700000000, '2023', '2023-11', 'migration keeps this text', 'failed'
    );
    INSERT INTO webhook_updates(
      update_id, channel_id, telegram_message_id, status, error, received_at, processed_at
    ) VALUES (
      '100', 'geekshare', 7, 'failed', 'old error', '2026-08-27 10:00:00', '2026-08-27 10:01:00'
    );
  `);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages"), 1);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages_fts WHERE id = 'message7'"), 1);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM webhook_updates"), 1);

  db.applyMigration("0005_webhook_media_reliability.sql");
  assert.deepEqual(
    db.row(
      `SELECT id, plain_text, media_archive_status, media_retry_count, media_last_error,
              media_next_retry_at, media_retry_exhausted
       FROM messages WHERE id = 'message7'`,
    ),
    {
      id: "message7",
      plain_text: "migration keeps this text",
      media_archive_status: "failed",
      media_retry_count: 0,
      media_last_error: null,
      media_next_retry_at: null,
      media_retry_exhausted: 0,
    },
  );
  assert.deepEqual(
    db.row(
      `SELECT update_id, status, error, received_at, processed_at,
              attempt_count, last_attempt_at
       FROM webhook_updates WHERE update_id = '100'`,
    ),
    {
      update_id: "100",
      status: "failed",
      error: "old error",
      received_at: "2026-08-27 10:00:00",
      processed_at: "2026-08-27 10:01:00",
      attempt_count: 1,
      last_attempt_at: "2026-08-27 10:01:00",
    },
  );
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages_fts WHERE id = 'message7'"), 1);
  assert.equal(
    db.scalar("SELECT COUNT(*) AS value FROM messages_fts WHERE messages_fts MATCH '\"migration keeps this text\"'"),
    1,
  );
});

test("Wrangler recognizes 0005 for both fresh apply and existing local D1 upgrade", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "geekshare-reliability-migration-"));
  const migrations = path.join(temporary, "migrations");
  const xdgConfig = path.join(temporary, "xdg");
  const upgradePersistence = path.join(temporary, "upgrade-d1");
  const freshPersistence = path.join(temporary, "fresh-d1");
  const config = path.join(temporary, "wrangler.json");
  mkdirSync(migrations, { recursive: true });
  mkdirSync(xdgConfig, { recursive: true });
  for (const migration of ALL_MIGRATIONS.slice(0, 4)) {
    copyFileSync(path.join(root, "migrations", migration), path.join(migrations, migration));
  }
  writeFileSync(config, JSON.stringify({
    name: "geekshare-migration-test",
    main: path.join(root, "src", "worker.ts").replaceAll("\\", "/"),
    compatibility_date: "2026-08-16",
    d1_databases: [{
      binding: "DB",
      database_name: "geekshare-archive",
      database_id: "00000000-0000-0000-0000-000000000000",
      migrations_dir: migrations.replaceAll("\\", "/"),
    }],
  }));

  const run = (args: string[], persistence: string): string => {
    const result = spawnSync(
      process.execPath,
      [wrangler, ...args, "--local", "--persist-to", persistence, "--config", config],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, CI: "1", XDG_CONFIG_HOME: xdgConfig },
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    if (result.status !== 0) throw new Error([result.stderr, result.stdout].filter(Boolean).join("\n"));
    return result.stdout;
  };

  try {
    run(["d1", "migrations", "apply", "geekshare-archive"], upgradePersistence);
    run([
      "d1", "execute", "geekshare-archive", "--command",
      `INSERT INTO channels(id, slug, title, username, telegram_url, archive_url)
       VALUES ('geekshare', 'geekshare', 'GeekShare', 'xgeekshare', 'https://t.me/xgeekshare', '/channel/geekshare');
       INSERT INTO messages(
         id, channel_id, origin_channel_id, telegram_message_id, source_url, date,
         published_at, published_year, published_month, plain_text, media_archive_status
       ) VALUES (
         'message7', 'geekshare', 'geekshare', 7, 'https://t.me/xgeekshare/7',
         '2023-11-15', 1700000000, '2023', '2023-11', 'wrangler upgrade text', 'failed'
       );
       INSERT INTO webhook_updates(update_id, status) VALUES ('100', 'processing');`,
    ], upgradePersistence);
    copyFileSync(
      path.join(root, "migrations", "0005_webhook_media_reliability.sql"),
      path.join(migrations, "0005_webhook_media_reliability.sql"),
    );
    const upgraded = run(["d1", "migrations", "apply", "geekshare-archive"], upgradePersistence);
    assert.match(upgraded, /0005_webhook_media_reliability\.sql/);
    const upgradeQuery = JSON.parse(run([
      "d1", "execute", "geekshare-archive", "--command",
      `SELECT COUNT(*) AS messages FROM messages;
       SELECT COUNT(*) AS fts FROM messages_fts;
       SELECT COUNT(*) AS updates FROM webhook_updates;
       SELECT media_retry_count, media_retry_exhausted FROM messages WHERE id = 'message7';
       SELECT attempt_count, last_attempt_at IS NOT NULL AS has_attempt_at
       FROM webhook_updates WHERE update_id = '100';`,
      "--json",
    ], upgradePersistence)) as Array<{ results: Array<Record<string, number>> }>;
    assert.deepEqual(upgradeQuery.map(({ results }) => results[0]), [
      { messages: 1 },
      { fts: 1 },
      { updates: 1 },
      { media_retry_count: 0, media_retry_exhausted: 0 },
      { attempt_count: 1, has_attempt_at: 1 },
    ]);

    const fresh = run(["d1", "migrations", "apply", "geekshare-archive"], freshPersistence);
    assert.match(fresh, /0001_initial\.sql/);
    assert.match(fresh, /0005_webhook_media_reliability\.sql/);
    const freshQuery = JSON.parse(run([
      "d1", "execute", "geekshare-archive", "--command",
      `SELECT COUNT(*) AS webhook_columns FROM pragma_table_info('webhook_updates')
       WHERE name IN ('attempt_count', 'last_attempt_at');
       SELECT COUNT(*) AS media_columns FROM pragma_table_info('messages')
       WHERE name IN ('media_retry_count', 'media_last_error', 'media_next_retry_at', 'media_retry_exhausted');`,
      "--json",
    ], freshPersistence)) as Array<{ results: Array<Record<string, number>> }>;
    assert.deepEqual(freshQuery.map(({ results }) => results[0]), [
      { webhook_columns: 2 },
      { media_columns: 4 },
    ]);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
