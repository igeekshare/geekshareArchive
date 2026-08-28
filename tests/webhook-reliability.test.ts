import assert from "node:assert/strict";
import test from "node:test";
import { handleApi, WEBHOOK_PROCESSING_LEASE_MS } from "../src/cloudflare/api";
import {
  createTestEnv,
  deliver,
  messageUpdate,
  reactionUpdate,
} from "./cloudflare-test-helpers";

test("webhook claims first delivery, skips terminal and fresh duplicates, and retries failed updates", async () => {
  const { db, env } = createTestEnv();
  const update = messageUpdate(1, "first #one");
  assert.equal((await deliver(env, update)).response.status, 204);
  assert.equal((await deliver(env, update)).response.status, 204);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages"), 1);
  assert.equal(db.countExecuted("INSERT INTO messages"), 1);
  assert.deepEqual(
    db.row("SELECT status, attempt_count FROM webhook_updates WHERE update_id = '1'"),
    { status: "success", attempt_count: 1 },
  );

  db.sqlite.prepare(
    `INSERT INTO webhook_updates(update_id, status, attempt_count, last_attempt_at)
     VALUES ('2', 'processing', 1, CURRENT_TIMESTAMP)`,
  ).run();
  assert.equal((await deliver(env, messageUpdate(2, "fresh duplicate", { messageId: 8 }))).response.status, 204);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages WHERE telegram_message_id = 8"), 0);
  assert.deepEqual(
    db.row("SELECT status, attempt_count FROM webhook_updates WHERE update_id = '2'"),
    { status: "processing", attempt_count: 1 },
  );

  db.failOnce((query) => query.includes("INSERT INTO messages"), "forced insert failure");
  assert.equal((await deliver(env, messageUpdate(3, "retry", { messageId: 9 }))).response.status, 500);
  const failed = db.row<{ status: string; processed_at: string | null }>(
    "SELECT status, processed_at FROM webhook_updates WHERE update_id = '3'",
  );
  assert.equal(failed.status, "failed");
  assert.ok(failed.processed_at);
  assert.equal((await deliver(env, messageUpdate(3, "retry", { messageId: 9 }))).response.status, 204);
  assert.deepEqual(
    db.row("SELECT status, error, attempt_count FROM webhook_updates WHERE update_id = '3'"),
    { status: "success", error: null, attempt_count: 2 },
  );
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages WHERE telegram_message_id = 9"), 1);
});

test("stale processing is reclaimed with a conditional claim and only one concurrent replay wins", async () => {
  assert.equal(WEBHOOK_PROCESSING_LEASE_MS, 10 * 60 * 1000);
  const { db, env } = createTestEnv();
  db.sqlite.prepare(
    `INSERT INTO webhook_updates(update_id, status, attempt_count, last_attempt_at)
     VALUES ('10', 'processing', 1, datetime('now', '-11 minutes'))`,
  ).run();
  const update = messageUpdate(10, "stale replay");
  const responses = await Promise.all([deliver(env, update), deliver(env, update)]);
  assert.deepEqual(responses.map(({ response }) => response.status), [204, 204]);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages"), 1);
  assert.equal(db.countExecuted("INSERT INTO messages"), 1);
  assert.deepEqual(
    db.row("SELECT status, attempt_count FROM webhook_updates WHERE update_id = '10'"),
    { status: "success", attempt_count: 2 },
  );
});

test("failed retry clears terminal metadata and starts a new counted attempt", async () => {
  const { db, env } = createTestEnv();
  db.sqlite.prepare(
    `INSERT INTO webhook_updates(
       update_id, status, error, received_at, processed_at, attempt_count, last_attempt_at
     ) VALUES (
       '11', 'failed', 'old failure', '2026-08-27 10:00:00', '2026-08-27 10:01:00',
       1, '2026-08-27 10:00:00'
     )`,
  ).run();
  db.failOnce((query) => query.includes("INSERT INTO messages"), "second attempt interrupted");
  db.failOnce((query) => query.includes("SET status = 'failed'"), "terminal state interrupted");
  await assert.rejects(deliver(env, messageUpdate(11, "retry metadata")), /terminal state interrupted/);
  const row = db.row<{
    status: string;
    error: string | null;
    received_at: string;
    processed_at: string | null;
    attempt_count: number;
    last_attempt_at: string;
  }>(
    `SELECT status, error, received_at, processed_at, attempt_count, last_attempt_at
     FROM webhook_updates WHERE update_id = '11'`,
  );
  assert.equal(row.status, "processing");
  assert.equal(row.error, null);
  assert.equal(row.received_at, "2026-08-27 10:00:00");
  assert.equal(row.processed_at, null);
  assert.equal(row.attempt_count, 2);
  assert.notEqual(row.last_attempt_at, "2026-08-27 10:00:00");
});

test("crash before message insert recovers after the processing lease becomes stale", async () => {
  const { db, env } = createTestEnv();
  db.failOnce((query) => query.includes("INSERT INTO messages"), "crash before message insert");
  db.failOnce((query) => query.includes("SET status = 'failed'"), "terminal state unavailable");
  const update = messageUpdate(20, "crash A");
  await assert.rejects(deliver(env, update), /terminal state unavailable/);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages"), 0);
  assert.deepEqual(
    db.row("SELECT status, processed_at, attempt_count FROM webhook_updates WHERE update_id = '20'"),
    { status: "processing", processed_at: null, attempt_count: 1 },
  );

  db.sqlite.prepare(
    "UPDATE webhook_updates SET last_attempt_at = datetime('now', '-11 minutes') WHERE update_id = '20'",
  ).run();
  assert.equal((await deliver(env, update)).response.status, 204);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages"), 1);
  assert.deepEqual(
    db.row("SELECT status, attempt_count FROM webhook_updates WHERE update_id = '20'"),
    { status: "success", attempt_count: 2 },
  );
});

test("crash after message commit recovers by upserting the same archive row and FTS row", async () => {
  const { db, env } = createTestEnv();
  db.failOnce(
    (query) => query.includes("UPDATE webhook_updates SET channel_id") && query.includes("status = 'success'"),
    "success state unavailable",
  );
  db.failOnce((query) => query.includes("SET status = 'failed'"), "failed state unavailable");
  const update = messageUpdate(21, "crash B current text");
  await assert.rejects(deliver(env, update), /failed state unavailable/);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages"), 1);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages_fts WHERE id = 'message7'"), 1);
  assert.equal(db.row<{ status: string }>("SELECT status FROM webhook_updates WHERE update_id = '21'").status, "processing");

  db.sqlite.prepare(
    "UPDATE webhook_updates SET last_attempt_at = datetime('now', '-11 minutes') WHERE update_id = '21'",
  ).run();
  assert.equal((await deliver(env, update)).response.status, 204);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages"), 1);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages_fts WHERE id = 'message7'"), 1);
  assert.equal(
    db.scalar("SELECT COUNT(*) AS value FROM messages_fts WHERE messages_fts MATCH '\"crash B current text\"'"),
    1,
  );
  assert.deepEqual(
    db.row("SELECT status, attempt_count FROM webhook_updates WHERE update_id = '21'"),
    { status: "success", attempt_count: 2 },
  );
});

test("composite Telegram identity preserves existing IDs and allows equal message numbers across channels", async () => {
  const { db, env } = createTestEnv([
    { id: "geekshare", username: "firstchannel", chatId: "-1001" },
    { id: "xgeekshare", username: "secondchannel", chatId: "-1002" },
  ]);
  assert.equal((await deliver(env, messageUpdate(30, "first", { messageId: 123, username: "firstchannel" }))).response.status, 204);
  assert.equal((await deliver(env, messageUpdate(31, "second", { messageId: 123, chatId: -1002, username: "secondchannel" }))).response.status, 204);
  assert.deepEqual(
    db.sqlite.prepare("SELECT id, origin_channel_id FROM messages ORDER BY origin_channel_id").all()
      .map((row) => ({ ...row })),
    [
      { id: "message123", origin_channel_id: "geekshare" },
      { id: "xgeekshare_123", origin_channel_id: "xgeekshare" },
    ],
  );

  db.sqlite.prepare(
    `INSERT INTO messages (
       id, channel_id, origin_channel_id, telegram_message_id, source_url, date,
       published_at, published_year, published_month, plain_text
     ) VALUES (
       'preserved-public-id', 'xgeekshare', 'xgeekshare', 124,
       'https://t.me/secondchannel/124', '2023-11-15', 1700000000,
       '2023', '2023-11', 'old text'
     )`,
  ).run();
  assert.equal((await deliver(env, messageUpdate(32, "updated existing", { messageId: 124, chatId: -1002, username: "secondchannel" }))).response.status, 204);
  assert.deepEqual(
    db.row("SELECT id, plain_text FROM messages WHERE origin_channel_id = 'xgeekshare' AND telegram_message_id = 124"),
    { id: "preserved-public-id", plain_text: "updated existing" },
  );
  assert.equal((await deliver(env, messageUpdate(33, "reply", {
    messageId: 125,
    chatId: -1002,
    username: "secondchannel",
    replyToMessageId: 124,
  }))).response.status, 204);
  assert.equal(
    db.row<{ reply_to: string }>("SELECT reply_to FROM messages WHERE origin_channel_id = 'xgeekshare' AND telegram_message_id = 125").reply_to,
    "preserved-public-id",
  );
});

test("duplicate edits preserve admin overrides and keep FTS content one-to-one", async () => {
  const { db, env } = createTestEnv([
    { id: "geekshare", username: "xgeekshare", chatId: "-1001" },
    { id: "display", username: "displaychannel", chatId: "-1002" },
  ]);
  const original = messageUpdate(40, "telegram original #old");
  assert.equal((await deliver(env, original)).response.status, 204);
  assert.equal((await deliver(env, original)).response.status, 204);

  const patch = await handleApi(
    new Request("https://archive.example.com/api/admin/messages/message7", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: "https://archive.example.com" },
      body: JSON.stringify({
        plainText: "admin body",
        tags: ["admin"],
        publishedAt: "2026-08-20T12:00",
        status: "hidden",
        channelId: "display",
      }),
    }),
    env,
  );
  assert.equal(patch.status, 200);

  const edit = messageUpdate(41, "telegram edit #new", { edited: true });
  assert.equal((await deliver(env, edit)).response.status, 204);
  assert.equal((await deliver(env, edit)).response.status, 204);
  assert.equal((await deliver(env, reactionUpdate(42))).response.status, 204);
  assert.deepEqual(
    db.row(
      `SELECT channel_id, html, plain_text, published_at, status, admin_override, reactions
       FROM messages WHERE id = 'message7'`,
    ),
    {
      channel_id: "display",
      html: "admin body",
      plain_text: "admin body",
      published_at: 1787198400,
      status: "hidden",
      admin_override: 1,
      reactions: JSON.stringify([{ emoji: "🔥", count: 3 }]),
    },
  );
  assert.deepEqual(
    db.sqlite.prepare("SELECT tag FROM message_tags WHERE message_id = 'message7'").all()
      .map((row) => ({ ...row })),
    [{ tag: "admin" }],
  );
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages_fts WHERE id = 'message7'"), 1);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages_fts WHERE messages_fts MATCH 'admin body'"), 1);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM messages_fts WHERE messages_fts MATCH 'telegram edit'"), 0);
});

test("missing reactions fail and later retry by composite identity while tombstones are ignored", async () => {
  const { db, env } = createTestEnv();
  const reaction = reactionUpdate(50);
  assert.equal((await deliver(env, reaction)).response.status, 500);
  assert.deepEqual(
    db.row("SELECT status, attempt_count FROM webhook_updates WHERE update_id = '50'"),
    { status: "failed", attempt_count: 1 },
  );

  assert.equal((await deliver(env, messageUpdate(51, "reaction target"))).response.status, 204);
  assert.equal((await deliver(env, reaction)).response.status, 204);
  assert.equal((await deliver(env, reaction)).response.status, 204);
  assert.deepEqual(
    db.row("SELECT reactions, engagement_score, plain_text FROM messages WHERE id = 'message7'"),
    {
      reactions: JSON.stringify([{ emoji: "🔥", count: 3 }]),
      engagement_score: 3,
      plain_text: "reaction target",
    },
  );
  assert.deepEqual(
    db.row("SELECT status, attempt_count FROM webhook_updates WHERE update_id = '50'"),
    { status: "success", attempt_count: 2 },
  );

  db.sqlite.prepare(
    `INSERT INTO message_tombstones(
       message_id, origin_channel_id, telegram_chat_id, telegram_message_id, cleanup_status
     ) VALUES ('deleted-999', 'geekshare', '-1001', 999, 'complete')`,
  ).run();
  const tombstonedReaction = reactionUpdate(52, 999);
  assert.equal((await deliver(env, tombstonedReaction)).response.status, 204);
  assert.equal((await deliver(env, tombstonedReaction)).response.status, 204);
  assert.deepEqual(
    db.row("SELECT status, channel_id, telegram_message_id, attempt_count FROM webhook_updates WHERE update_id = '52'"),
    { status: "ignored", channel_id: "geekshare", telegram_message_id: 999, attempt_count: 1 },
  );
});
