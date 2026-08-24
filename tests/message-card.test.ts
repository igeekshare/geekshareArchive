import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MessageCard from "../src/components/MessageCard";
import type { PublicMessage } from "../src/lib/messages";

function publicMessage(overrides: Partial<PublicMessage> = {}): PublicMessage {
  const mediaItems = Array.from({ length: 5 }, (_, index) => ({
    type: "photo" as const,
    url: `https://cdn.example.com/photo-${index + 1}.jpg`,
    archiveStatus: "archived" as const,
  }));

  return {
    id: "message1",
    channelId: "geekshare",
    telegramMessageId: 1,
    sourceUrl: "https://t.me/xgeekshare/1",
    date: "2026-08-23",
    datetime: "2026-08-23T12:00:00+08:00",
    from: "极客分享",
    text: '<strong>完整正文</strong><br><a href="https://example.com/download">下载页面</a>',
    plainText: "完整正文\n下载页面",
    title: "🧠 Wake",
    titleHtml: "<strong>🧠 Wake</strong>",
    summary: "这段摘要不应出现在帖子卡片中",
    tags: ["macos", "agent", "claude", "codex", "gemini", "local"],
    media: mediaItems[0],
    mediaItems,
    replyTo: null,
    reactions: null,
    archiveStatus: "archived",
    isFeatured: false,
    featuredOrder: 0,
    engagementScore: 0,
    channel: {
      title: "极客分享",
      username: "xgeekshare",
    },
    ...overrides,
  };
}

test("feed cards render the rich body, every tag and every media item", () => {
  const html = renderToStaticMarkup(createElement(MessageCard, { message: publicMessage() }));

  assert.match(html, /href="\/message\/message1"[^>]*><strong>🧠 Wake<\/strong><\/a>/);
  assert.match(html, /message-reading-body--clamped/);
  assert.match(html, /<strong>完整正文<\/strong><br\/?><a href="https:\/\/example\.com\/download">下载页面<\/a>/);
  assert.doesNotMatch(html, /这段摘要不应出现在帖子卡片中/);
  assert.match(html, /#macos/);
  assert.match(html, /#local/);
  assert.match(html, /photo-5\.jpg/);
  assert.doesNotMatch(html, /object-cover/);
});

test("detail cards keep the same content order without clamping or summary duplication", () => {
  const html = renderToStaticMarkup(createElement(MessageCard, { message: publicMessage(), mode: "detail" }));
  const titleIndex = html.indexOf("🧠 Wake");
  const tagsIndex = html.indexOf("#macos");
  const bodyIndex = html.indexOf("完整正文");
  const mediaIndex = html.indexOf("photo-1.jpg");

  assert.ok(titleIndex >= 0 && titleIndex < tagsIndex);
  assert.ok(tagsIndex < bodyIndex);
  assert.ok(bodyIndex < mediaIndex);
  assert.doesNotMatch(html, /message-reading-body--clamped/);
  assert.doesNotMatch(html, /这段摘要不应出现在帖子卡片中/);
  assert.doesNotMatch(html, /<h1[^>]*>\s*<a/);
});
