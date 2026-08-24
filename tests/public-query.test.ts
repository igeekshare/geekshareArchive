import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSyncSuccessRate,
  choosePrimaryChannel,
  encodeMessageCursor,
  messageCategoryClause,
  parseChannelFilter,
  parseMessageCategory,
  parseMessageCursor,
  parseMessageSort,
} from "../src/cloudflare/public-query";

test("public list options only accept documented categories and sort orders", () => {
  assert.equal(parseMessageCategory(null), "all");
  assert.equal(parseMessageCategory("interactive"), "interactive");
  assert.equal(parseMessageCategory("unknown"), null);
  assert.equal(parseMessageSort(null), "newest");
  assert.equal(parseMessageSort("oldest"), "oldest");
  assert.equal(parseMessageSort("featured"), "featured");
  assert.equal(parseMessageSort("hot"), "hot");
  assert.equal(parseMessageSort("random"), null);
  assert.equal(parseChannelFilter(null), null);
  assert.equal(parseChannelFilter("geekshare"), "geekshare");
  assert.equal(parseChannelFilter("Bad Channel"), undefined);
});

test("message cursors round-trip and reject malformed state", () => {
  const cursor = { publishedAt: 1_723_456_789, id: "geekshare:42", featuredOrder: 3, engagementScore: 18 };
  assert.deepEqual(parseMessageCursor(encodeMessageCursor(cursor)), cursor);
  assert.equal(parseMessageCursor(null), null);
  assert.equal(parseMessageCursor("not-a-cursor"), undefined);
});

test("message categories map to their stored message signals", () => {
  assert.match(messageCategoryClause("visual"), /photo/);
  assert.match(messageCategoryClause("link"), /m\.html/);
  assert.match(messageCategoryClause("interactive"), /reactions/);
  assert.match(messageCategoryClause("file"), /file/);
  assert.equal(messageCategoryClause("all"), "");
});

test("homepage channel selection and legacy sync metric helpers use real data", () => {
  assert.deepEqual(choosePrimaryChannel([{ id: "a", message_count: 2 }, { id: "b", message_count: 9 }]), { id: "b", message_count: 9 });
  assert.equal(choosePrimaryChannel([]), null);
  assert.equal(calculateSyncSuccessRate(98, 2), 98);
  assert.equal(calculateSyncSuccessRate(0, 0), null);
});
