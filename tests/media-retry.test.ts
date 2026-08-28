import assert from "node:assert/strict";
import test from "node:test";
import {
  handleApi,
  MEDIA_MAX_RETRY_ATTEMPTS,
  mediaRetryDelayMs,
  runHourlyMaintenance,
} from "../src/cloudflare/api";
import type { TelegramUpdate } from "../src/cloudflare/telegram";
import {
  createTestEnv,
  deliver,
  messageUpdate,
  telegramFetch,
} from "./cloudflare-test-helpers";

test("media failure preserves text, records retry metadata, and duplicate delivery has no second side effect", async (context) => {
  const mocked = telegramFetch({ failGetFile: (fileId) => fileId === "photo-file" });
  context.mock.method(globalThis, "fetch", mocked.handler);
  const { db, env } = createTestEnv();
  const update = messageUpdate(100, "body survives #media", { photo: true });
  const first = await deliver(env, update, true);
  await first.context.settle();
  const duplicate = await deliver(env, update, true);
  await duplicate.context.settle();

  const row = db.row<{
    plain_text: string;
    media_archive_status: string;
    media_retry_count: number;
    media_last_error: string;
    media_next_retry_at: string;
    media_retry_exhausted: number;
  }>(
    `SELECT plain_text, media_archive_status, media_retry_count, media_last_error,
            media_next_retry_at, media_retry_exhausted
     FROM messages WHERE id = 'message7'`,
  );
  assert.equal(row.plain_text, "body survives #media");
  assert.equal(row.media_archive_status, "failed");
  assert.equal(row.media_retry_count, 1);
  assert.match(row.media_last_error, /Forced getFile failure/);
  assert.ok(Date.parse(row.media_next_retry_at) > Date.now());
  assert.equal(row.media_retry_exhausted, 0);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM sync_logs WHERE source = 'media'"), 1);
  assert.deepEqual([first.response.status, duplicate.response.status], [204, 204]);
});

test("R2 success followed by D1 failure recovers through HEAD without a duplicate PUT", async (context) => {
  const mocked = telegramFetch();
  context.mock.method(globalThis, "fetch", mocked.handler);
  const { db, env, media } = createTestEnv();
  db.failOnce(
    (query) => query.includes("UPDATE messages SET media = ?, media_archive_status = ?"),
    "forced post-R2 D1 failure",
  );
  const delivered = await deliver(env, messageUpdate(101, "r2 before d1", { photo: true }), true);
  await delivered.context.settle();
  assert.deepEqual(
    db.row("SELECT media_archive_status, media_retry_count FROM messages WHERE id = 'message7'"),
    { media_archive_status: "failed", media_retry_count: 1 },
  );
  assert.equal(media.puts.filter((key) => key.includes("photo-unique")).length, 1);

  db.sqlite.prepare(
    "UPDATE messages SET media_next_retry_at = datetime('now', '-1 minute') WHERE id = 'message7'",
  ).run();
  await runHourlyMaintenance(env);
  assert.deepEqual(
    db.row(
      `SELECT media_archive_status, media_retry_count, media_last_error,
              media_next_retry_at, media_retry_exhausted
       FROM messages WHERE id = 'message7'`,
    ),
    {
      media_archive_status: "archived",
      media_retry_count: 0,
      media_last_error: null,
      media_next_retry_at: null,
      media_retry_exhausted: 0,
    },
  );
  assert.equal(media.puts.filter((key) => key.includes("photo-unique")).length, 1);
  assert.ok(media.heads.filter((key) => key.includes("photo-unique")).length >= 2);
});

test("thumbnail failure remains retryable and recovery only HEAD-checks the archived main object", async (context) => {
  const mocked = telegramFetch();
  context.mock.method(globalThis, "fetch", mocked.handler);
  const { db, env, media } = createTestEnv();
  media.failNextPut((key) => key.includes("thumb-unique"));
  const update: TelegramUpdate = {
    update_id: 102,
    channel_post: {
      message_id: 7,
      date: 1_700_000_000,
      chat: { id: -1001, username: "xgeekshare", type: "channel" },
      document: {
        file_id: "document-file",
        file_unique_id: "document-unique",
        file_size: 100,
        file_name: "document.pdf",
        mime_type: "application/pdf",
        thumbnail: {
          file_id: "thumb-file",
          file_unique_id: "thumb-unique",
          file_size: 20,
          mime_type: "image/jpeg",
        },
      },
    },
  };
  const delivered = await deliver(env, update, true);
  await delivered.context.settle();
  const failed = db.row<{ media_archive_status: string; media: string; media_retry_count: number }>(
    "SELECT media_archive_status, media, media_retry_count FROM messages WHERE id = 'message7'",
  );
  const failedMedia = JSON.parse(failed.media) as Array<{ r2Key?: string; thumbKey?: string; archiveStatus: string }>;
  assert.equal(failed.media_archive_status, "failed");
  assert.equal(failed.media_retry_count, 1);
  assert.equal(failedMedia[0].r2Key, "channels/geekshare/7/document-unique.pdf");
  assert.equal(failedMedia[0].thumbKey, undefined);
  assert.equal(failedMedia[0].archiveStatus, "failed");
  assert.equal(media.puts.filter((key) => key.includes("document-unique")).length, 1);

  db.sqlite.prepare(
    "UPDATE messages SET media_next_retry_at = datetime('now', '-1 minute') WHERE id = 'message7'",
  ).run();
  await runHourlyMaintenance(env);
  const recovered = db.row<{ media_archive_status: string; media: string; media_retry_count: number }>(
    "SELECT media_archive_status, media, media_retry_count FROM messages WHERE id = 'message7'",
  );
  const recoveredMedia = JSON.parse(recovered.media) as Array<{ r2Key?: string; thumbKey?: string }>;
  assert.equal(recovered.media_archive_status, "archived");
  assert.equal(recovered.media_retry_count, 0);
  assert.equal(recoveredMedia[0].r2Key, "channels/geekshare/7/document-unique.pdf");
  assert.equal(recoveredMedia[0].thumbKey, "channels/geekshare/7/thumb-unique.jpg");
  assert.equal(media.puts.filter((key) => key.includes("document-unique")).length, 1);
  assert.ok(media.heads.filter((key) => key.includes("document-unique")).length >= 2);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM sync_logs WHERE source = 'media'"), 1);
});

test("automatic media retry uses bounded exponential backoff and stops after exhaustion", async (context) => {
  let failing = true;
  const mocked = telegramFetch({ failGetFile: (fileId) => failing && fileId === "photo-file" });
  context.mock.method(globalThis, "fetch", mocked.handler);
  const { db, env } = createTestEnv();
  const delivered = await deliver(env, messageUpdate(103, "bounded retry", { photo: true }), true);
  await delivered.context.settle();
  assert.equal(MEDIA_MAX_RETRY_ATTEMPTS, 5);
  assert.deepEqual(
    [1, 2, 3, 4, 5].map(mediaRetryDelayMs),
    [3_600_000, 7_200_000, 14_400_000, 28_800_000, null],
  );

  for (let expected = 2; expected <= MEDIA_MAX_RETRY_ATTEMPTS; expected += 1) {
    db.sqlite.prepare(
      "UPDATE messages SET media_next_retry_at = datetime('now', '-1 minute') WHERE id = 'message7'",
    ).run();
    await runHourlyMaintenance(env);
    assert.equal(
      db.row<{ media_retry_count: number }>("SELECT media_retry_count FROM messages WHERE id = 'message7'").media_retry_count,
      expected,
    );
  }
  assert.deepEqual(
    db.row(
      `SELECT media_archive_status, media_retry_count, media_next_retry_at,
              media_retry_exhausted
       FROM messages WHERE id = 'message7'`,
    ),
    {
      media_archive_status: "failed",
      media_retry_count: 5,
      media_next_retry_at: null,
      media_retry_exhausted: 1,
    },
  );
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM sync_logs WHERE source = 'media'"), 5);
  await runHourlyMaintenance(env);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM sync_logs WHERE source = 'media'"), 5);

  failing = false;
  const manual = await handleApi(
    new Request("https://archive.example.com/api/admin/messages/message7/retry-media", {
      method: "POST",
      headers: { Origin: "https://archive.example.com" },
    }),
    env,
  );
  assert.equal(manual.status, 200);
  assert.deepEqual(
    db.row("SELECT media_archive_status, media_retry_count, media_retry_exhausted FROM messages WHERE id = 'message7'"),
    { media_archive_status: "archived", media_retry_count: 0, media_retry_exhausted: 0 },
  );
});

test("scheduled retry skips deleting rows and processes the next eligible message", async (context) => {
  let failing = true;
  const mocked = telegramFetch({ failGetFile: () => failing });
  context.mock.method(globalThis, "fetch", mocked.handler);
  const { db, env } = createTestEnv();
  const first = await deliver(env, messageUpdate(104, "deleting", { photo: true }), true);
  const second = await deliver(env, messageUpdate(105, "eligible", { messageId: 8, photo: true }), true);
  await Promise.all([first.context.settle(), second.context.settle()]);
  db.sqlite.prepare(
    `UPDATE messages SET status = 'deleting', media_next_retry_at = datetime('now', '-2 hours'),
       updated_at = datetime('now', '-2 hours') WHERE id = 'message7'`,
  ).run();
  db.sqlite.prepare(
    `UPDATE messages SET media_next_retry_at = datetime('now', '-1 hour'),
       updated_at = datetime('now', '-1 hour') WHERE id = 'message8'`,
  ).run();

  failing = false;
  await runHourlyMaintenance(env);
  assert.equal(
    db.row<{ media_archive_status: string }>("SELECT media_archive_status FROM messages WHERE id = 'message7'").media_archive_status,
    "failed",
  );
  assert.equal(
    db.row<{ media_archive_status: string }>("SELECT media_archive_status FROM messages WHERE id = 'message8'").media_archive_status,
    "archived",
  );
});

test("oversized unsupported file media records a permanent explicit failure and is not auto-retried", async (context) => {
  const mocked = telegramFetch();
  context.mock.method(globalThis, "fetch", mocked.handler);
  const { db, env } = createTestEnv();
  const update: TelegramUpdate = {
    update_id: 106,
    channel_post: {
      message_id: 7,
      date: 1_700_000_000,
      chat: { id: -1001, username: "xgeekshare", type: "channel" },
      document: {
        file_id: "large-document",
        file_unique_id: "large-document-unique",
        file_size: 20 * 1024 * 1024 + 1,
        file_name: "large.pdf",
        mime_type: "application/pdf",
      },
    },
  };
  const delivered = await deliver(env, update, true);
  await delivered.context.settle();
  const row = db.row<{
    media_archive_status: string;
    media_retry_count: number;
    media_last_error: string;
    media_next_retry_at: string | null;
    media_retry_exhausted: number;
  }>(
    `SELECT media_archive_status, media_retry_count, media_last_error,
            media_next_retry_at, media_retry_exhausted
     FROM messages WHERE id = 'message7'`,
  );
  assert.equal(row.media_archive_status, "failed");
  assert.equal(row.media_retry_count, 1);
  assert.match(row.media_last_error, /Oversized Telegram file media is unsupported/);
  assert.equal(row.media_next_retry_at, null);
  assert.equal(row.media_retry_exhausted, 1);
  assert.equal(mocked.getFileIds.length, 0);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM sync_logs WHERE source = 'media'"), 1);
  await runHourlyMaintenance(env);
  assert.equal(db.scalar("SELECT COUNT(*) AS value FROM sync_logs WHERE source = 'media'"), 1);
});
