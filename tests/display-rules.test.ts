import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDisplayBlockRule } from "../src/cloudflare/display-rules";
import type { HomepageData, MessageDiscoveryContext, MessageListResponse } from "../src/lib/messages";
import {
  createTestEnv,
  deliver,
  messageUpdate,
} from "./cloudflare-test-helpers";
import { handleApi } from "../src/cloudflare/api";

function insertMessage(
  db: ReturnType<typeof createTestEnv>["db"],
  options: {
    id: string;
    telegramMessageId: number;
    plainText: string;
    publishedAt: number;
    tags?: string[];
    featured?: boolean;
  },
): void {
  db.sqlite.prepare(
    `INSERT INTO messages (
       id, channel_id, origin_channel_id, telegram_message_id, source_url,
       date, datetime, published_at, published_year, published_month,
       sender, html, plain_text, media, reactions, media_archive_status,
       status, is_featured, featured_order, engagement_score
     ) VALUES (?, 'geekshare', 'geekshare', ?, ?, '2026-09-11',
       '2026-09-11T12:00:00+08:00', ?, '2026', '2026-09',
       'GeekShare', ?, ?, '[]', '[]', 'none', 'published', ?, 0, 0)`,
  ).run(
    options.id,
    options.telegramMessageId,
    `https://t.me/xgeekshare/${options.telegramMessageId}`,
    options.publishedAt,
    options.plainText,
    options.plainText,
    options.featured ? 1 : 0,
  );
  for (const tag of options.tags ?? []) {
    db.sqlite.prepare("INSERT INTO message_tags(message_id, tag) VALUES (?, ?)")
      .run(options.id, tag);
  }
}

function adminRequest(path: string, method = "GET", body?: unknown): Request {
  return new Request(`https://archive.example.com${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

test("display rules normalize tags and case-insensitive keyword identities", () => {
  assert.deepEqual(normalizeDisplayBlockRule("tag", "  ##Cloudflare "), {
    ok: true,
    rule: { type: "tag", value: "cloudflare", normalizedValue: "cloudflare" },
  });
  assert.deepEqual(normalizeDisplayBlockRule("keyword", "  Sponsor Deal "), {
    ok: true,
    rule: { type: "keyword", value: "Sponsor Deal", normalizedValue: "sponsor deal" },
  });
  assert.equal(normalizeDisplayBlockRule("tag", "bad tag").ok, false);
  assert.equal(normalizeDisplayBlockRule("keyword", " ").ok, false);
  assert.equal(normalizeDisplayBlockRule("keyword", "字".repeat(101)).ok, false);
  assert.equal(normalizeDisplayBlockRule("unknown", "value").ok, false);
});

test("admin display rules filter every public discovery surface while keeping admin visibility", async () => {
  const { db, env } = createTestEnv();
  insertMessage(db, {
    id: "tag-blocked",
    telegramMessageId: 1,
    plainText: "标签命中的历史内容",
    publishedAt: 100,
    tags: ["ads"],
  });
  insertMessage(db, {
    id: "visible-one",
    telegramMessageId: 2,
    plainText: "第一条正常技术内容",
    publishedAt: 200,
    tags: ["tech"],
    featured: true,
  });
  insertMessage(db, {
    id: "keyword-blocked",
    telegramMessageId: 3,
    plainText: "This SPONSOR offer should not be public",
    publishedAt: 300,
    tags: ["promotion"],
  });
  insertMessage(db, {
    id: "visible-two",
    telegramMessageId: 4,
    plainText: "第二条正常技术内容",
    publishedAt: 400,
    tags: ["tech"],
  });

  const tagCreated = await handleApi(
    adminRequest("/api/admin/display-rules", "POST", { type: "tag", value: "#ADS" }),
    env,
  );
  assert.equal(tagCreated.status, 201);
  const tagRule = await tagCreated.json() as { id: number; value: string; matchCount: number };
  assert.equal(tagRule.value, "ads");
  assert.equal(tagRule.matchCount, 1);

  const keywordCreated = await handleApi(
    adminRequest("/api/admin/display-rules", "POST", { type: "keyword", value: "sponsor" }),
    env,
  );
  assert.equal(keywordCreated.status, 201);
  assert.equal((await keywordCreated.json() as { matchCount: number }).matchCount, 1);

  const duplicate = await handleApi(
    adminRequest("/api/admin/display-rules", "POST", { type: "tag", value: "ads" }),
    env,
  );
  assert.equal(duplicate.status, 409);

  const rulesResponse = await handleApi(adminRequest("/api/admin/display-rules"), env);
  const rules = await rulesResponse.json() as Array<{ type: string; value: string }>;
  assert.deepEqual(
    rules.map(({ type, value }) => ({ type, value })),
    [
      { type: "keyword", value: "sponsor" },
      { type: "tag", value: "ads" },
    ],
  );

  const listResponse = await handleApi(
    new Request("https://archive.example.com/api/messages?limit=20"),
    env,
  );
  const list = await listResponse.json() as MessageListResponse;
  assert.equal(list.total, 2);
  assert.deepEqual(list.items.map(({ id }) => id), ["visible-two", "visible-one"]);

  const homepageResponse = await handleApi(
    new Request("https://archive.example.com/api/homepage"),
    env,
  );
  const homepage = await homepageResponse.json() as HomepageData;
  assert.equal(homepage.stats.messageCount, 2);
  assert.equal(homepage.stats.tagCount, 1);
  assert.deepEqual(homepage.hotTopics, [{ tag: "tech", count: 2 }]);
  assert.deepEqual(homepage.featuredMessages.map(({ id }) => id), ["visible-one"]);
  assert.equal(homepage.channels[0].messageCount, 2);

  const metaResponse = await handleApi(
    new Request("https://archive.example.com/api/archive-meta"),
    env,
  );
  const meta = await metaResponse.json() as { tags: Array<{ tag: string; count: number }> };
  assert.deepEqual(meta.tags, [{ tag: "tech", count: 2 }]);

  assert.equal((await handleApi(
    new Request("https://archive.example.com/api/messages/tag-blocked"),
    env,
  )).status, 404);
  assert.equal((await handleApi(
    new Request("https://archive.example.com/api/messages/keyword-blocked"),
    env,
  )).status, 404);
  assert.equal((await handleApi(
    new Request("https://archive.example.com/api/messages/visible-one"),
    env,
  )).status, 200);

  const discoveryResponse = await handleApi(
    new Request("https://archive.example.com/api/messages/visible-one/discovery"),
    env,
  );
  const discovery = await discoveryResponse.json() as MessageDiscoveryContext;
  assert.equal(discovery.previous, null);
  assert.equal(discovery.next?.id, "visible-two");
  assert.deepEqual(discovery.related.map(({ id }) => id), ["visible-two"]);

  const delivered = await deliver(env, messageUpdate(50, "A future SPONSOR post", { messageId: 5 }));
  assert.equal(delivered.response.status, 204);
  const futurePublic = await handleApi(
    new Request("https://archive.example.com/api/messages?ids=message5"),
    env,
  );
  assert.equal((await futurePublic.json() as MessageListResponse).total, 0);

  const adminMessages = await handleApi(adminRequest("/api/admin/messages"), env);
  const adminItems = await adminMessages.json() as {
    items: Array<{
      id: string;
      displayBlockReasons: Array<{ type: string; value: string }>;
    }>;
  };
  const reasonsById = new Map(adminItems.items.map((item) => [item.id, item.displayBlockReasons]));
  assert.deepEqual(reasonsById.get("tag-blocked"), [{ id: tagRule.id, type: "tag", value: "ads" }]);
  assert.deepEqual(reasonsById.get("keyword-blocked")?.map(({ type, value }) => ({ type, value })), [
    { type: "keyword", value: "sponsor" },
  ]);
  assert.deepEqual(reasonsById.get("visible-one"), []);
  assert.deepEqual(reasonsById.get("message5")?.map(({ type, value }) => ({ type, value })), [
    { type: "keyword", value: "sponsor" },
  ]);

  const deleted = await handleApi(
    adminRequest(`/api/admin/display-rules/${tagRule.id}`, "DELETE"),
    env,
  );
  assert.equal(deleted.status, 200);
  const afterDelete = await handleApi(
    new Request("https://archive.example.com/api/messages?limit=20"),
    env,
  );
  assert.deepEqual(
    (await afterDelete.json() as MessageListResponse).items.map(({ id }) => id),
    ["visible-two", "visible-one", "tag-blocked"],
  );
  assert.equal((await handleApi(
    adminRequest(`/api/admin/display-rules/${tagRule.id}`, "DELETE"),
    env,
  )).status, 404);
});
