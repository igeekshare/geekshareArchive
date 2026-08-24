import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveDisplaySummary,
  deriveDisplayTitle,
  deriveMessagePresentation,
  messageRowToPublic,
  type MessageRow,
} from "../src/cloudflare/models";

function messageRow(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: "message1",
    channel_id: "geekshare",
    telegram_message_id: 1,
    source_url: "https://t.me/xgeekshare/1",
    date: "2026-08-23",
    datetime: "2026-08-23T12:00:00+08:00",
    published_at: 1_777_000_000,
    published_year: "2026",
    published_month: "2026-08",
    sender: "极客分享",
    html: "标题<br>正文",
    plain_text: "标题\n正文",
    media: "[]",
    reply_to: null,
    reactions: "[]",
    media_archive_status: "none",
    display_title: null,
    display_summary: null,
    is_featured: 0,
    featured_order: 0,
    engagement_score: 0,
    tags: "[]",
    channel_title: "极客分享",
    channel_username: "xgeekshare",
    channel_avatar_key: null,
    ...overrides,
  };
}

test("Wake post becomes a rich title, lowercase tag, and signature-free body", () => {
  const title = "Wake - 把 Claude Code、Codex 等 Agent 会话统一收进一个窗口";
  const html = [
    "#macOS",
    "",
    `<strong>🧠&nbsp;</strong><a href="https://github.com/iAmCorey/Wake" rel="noopener noreferrer"><strong>${title}</strong></a>`,
    "",
    '⬇️&nbsp;<a href="https://github.com/iAmCorey/Wake/releases" rel="noopener noreferrer"><strong>下载页面</strong></a>',
    "",
    "Wake 是一款原生 macOS 工具，用于收集 Agent 会话。",
    "",
    "除了浏览历史，还能全文搜索中英文和代码、查看完整对话等，所有数据都保存在本地。",
    "",
    '<strong>📮</strong><a href="https://t.me/Geekshare_bot"><strong>投稿</strong></a>&nbsp;<strong>📢</strong><a href="https://t.me/+6b0SECRd6cw5MzE1"><strong>频道</strong></a>&nbsp;<strong>💬</strong><a href="https://t.me/igeekshare"><strong>吹水</strong></a>&nbsp;<strong>🌐</strong><a href="https://geekshare.org/"><strong>网站</strong></a>',
  ].join("<br>");
  const plainText = [
    "#macOS",
    "",
    `🧠 ${title}`,
    "",
    "⬇️ 下载页面",
    "",
    "Wake 是一款原生 macOS 工具，用于收集 Agent 会话。",
    "",
    "除了浏览历史，还能全文搜索中英文和代码、查看完整对话等，所有数据都保存在本地。",
    "",
    "📮投稿 📢频道 💬吹水 🌐网站",
  ].join("\n");

  const message = messageRowToPublic(messageRow({ html, plain_text: plainText, tags: '["macos"]' }), "");

  assert.equal(message.title, `🧠 ${title}`);
  assert.match(message.titleHtml ?? "", /<strong>🧠&nbsp;<\/strong>/);
  assert.doesNotMatch(message.titleHtml ?? "", /<a(?:\s|>)/i);
  assert.deepEqual(message.tags, ["macos"]);
  assert.match(message.plainText, /^⬇️\s+下载页面/);
  assert.match(message.text, /Wake\/releases/);
  assert.doesNotMatch(message.text, /#macOS|Geekshare_bot|igeekshare|📮|📢|💬|🌐/);
});

test("standalone tag lines are removed while inline hashtags stay in the body", () => {
  const presentation = deriveMessagePresentation(
    "#工具<br><strong>标题<br>正文中的 #标签</strong><br>#单独标签<br>结尾",
    "#工具\n标题\n正文中的 #标签\n#单独标签\n结尾",
  );

  assert.equal(presentation.title, "标题");
  assert.equal(presentation.titleHtml, "<strong>标题</strong>");
  assert.equal(presentation.bodyPlainText, "正文中的 #标签\n结尾");
  assert.equal(presentation.bodyHtml, "<strong>正文中的 #标签</strong><br>结尾");
});

test("only a trailing channel signature block is removed", () => {
  const trailing = deriveMessagePresentation(
    "标题<br>正文中的投稿和网站应保留<br>📮投稿<br><br>📢频道<br>💬吹水<br>🌐网站",
    "标题\n正文中的投稿和网站应保留\n📮投稿\n\n📢频道\n💬吹水\n🌐网站",
  );
  assert.equal(trailing.bodyPlainText, "正文中的投稿和网站应保留");

  const middle = deriveMessagePresentation(
    "标题<br>📮投稿<br>后续正文",
    "标题\n📮投稿\n后续正文",
  );
  assert.equal(middle.bodyPlainText, "📮投稿\n后续正文");
});

test("formatting that crosses a line break remains balanced after title extraction", () => {
  const presentation = deriveMessagePresentation(
    "<strong><a href=\"https://example.com\">标题<br>正文链接</a></strong>",
    "标题\n正文链接",
  );
  assert.equal(
    presentation.titleHtml,
    "<strong>标题</strong>",
  );
  assert.equal(
    presentation.bodyHtml,
    '<strong><a href="https://example.com">正文链接</a></strong>',
  );
});

test("long rich titles are truncated without leaving open markup", () => {
  const presentation = deriveMessagePresentation(
    `<a href="https://example.com"><strong>${"长".repeat(90)}</strong></a><br>正文`,
    `${"长".repeat(90)}\n正文`,
  );
  assert.ok([...presentation.title].length <= 73);
  assert.match(presentation.title, /…$/);
  assert.match(presentation.titleHtml, /…<\/strong>$/);
  assert.doesNotMatch(presentation.titleHtml, /<a(?:\s|>)/i);
  assert.equal(presentation.bodyPlainText, "正文");
});

test("empty text falls back to a media title and empty body", () => {
  assert.deepEqual(deriveMessagePresentation("", ""), {
    title: "媒体内容",
    titleHtml: "媒体内容",
    bodyHtml: "",
    bodyPlainText: "",
  });
});

test("manual titles stay escaped while the admin view keeps the original Telegram body", () => {
  const row = messageRow({
    html: "#macOS<br><strong>来源标题</strong><br>公开正文<br>📮投稿 📢频道 💬吹水 🌐网站",
    plain_text: "#macOS\n来源标题\n公开正文\n📮投稿 📢频道 💬吹水 🌐网站",
    display_title: "<管理标题>",
  });
  const publicMessage = messageRowToPublic(row, "");
  const adminMessage = messageRowToPublic(row, "", { content: "raw" });

  assert.equal(publicMessage.title, "<管理标题>");
  assert.equal(publicMessage.titleHtml, "&lt;管理标题&gt;");
  assert.equal(publicMessage.plainText, "公开正文");
  assert.equal(adminMessage.plainText, row.plain_text);
  assert.equal(adminMessage.text, row.html);
});

test("plain title and summary helpers follow the public presentation rules", () => {
  const content = "#Cloudflare #Nextjs\n🚀 用 D1 做一个真正可发现的技术归档\n📢频道";
  assert.equal(deriveDisplayTitle(content), "🚀 用 D1 做一个真正可发现的技术归档");
  assert.equal(
    deriveDisplayTitle("Cloudflare Worker 使用 D1 保存消息。#Cloudflare #技术栈"),
    "Cloudflare Worker 使用 D1 保存消息。#Cloudflare #技术栈",
  );

  const title = "技术归档升级";
  assert.equal(deriveDisplaySummary(`${title}\n从归档管理面板变成内容发现页。`, title), "从归档管理面板变成内容发现页。");
  assert.ok([...deriveDisplaySummary("测试".repeat(200))].length <= 181);
  assert.equal(deriveDisplaySummary("多反应演示消息。#互动", "多反应演示消息。"), "多反应演示消息。");
});
