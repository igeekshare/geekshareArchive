import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveMedia,
  extractTags,
  mediaUrlFromEmbed,
  messageMedia,
  shanghaiDate,
  stableMessageId,
  telegramMessageContent,
  telegramTextToHtml,
} from "../src/cloudflare/telegram";
import type { Env } from "../src/cloudflare/runtime";

test("Telegram entities become a small safe HTML subset", () => {
  const text = "Hello <world> example.com";
  const html = telegramTextToHtml(text, [
    { type: "bold", offset: 0, length: 5 },
    { type: "text_link", offset: 14, length: 11, url: "https://example.com" },
  ]);
  assert.equal(
    html,
    '<strong>Hello</strong> &lt;world&gt; <a href="https://example.com/" rel="noopener noreferrer">example.com</a>',
  );
  assert.equal(
    telegramTextToHtml("click", [
      { type: "text_link", offset: 0, length: 5, url: "javascript:alert(1)" },
    ]),
    "click",
  );
});

test("Telegram rich messages become safe searchable HTML, text, and ordered media", () => {
  const content = telegramMessageContent({
    message_id: 8,
    date: 0,
    chat: { id: -1001 },
    rich_message: {
      blocks: [
        {
          type: "heading",
          size: 1,
          text: { type: "bold", text: ["<富文本标题>", { type: "url", text: " 官网", url: "https://example.com/docs?a=1&b=2" }] },
        },
        {
          type: "paragraph",
          text: ["正文 #Rich", { type: "url", text: " 不安全链接", url: "javascript:alert(1)" }],
        },
        {
          type: "list",
          items: [
            { label: "•", blocks: [{ type: "paragraph", text: "第一项" }] },
            { has_checkbox: true, is_checked: true, blocks: [{ type: "paragraph", text: { type: "code", text: "done()" } }] },
          ],
        },
        {
          type: "blockquote",
          blocks: [{ type: "paragraph", text: { type: "italic", text: "引用" } }],
          credit: "作者",
        },
        { type: "pre", language: "ts\" onclick=\"x", text: "const value = 1;\nvalue++;" },
        {
          type: "table",
          is_bordered: true,
          caption: "数据表",
          cells: [[
            { text: "名称", is_header: true },
            { text: "数值", is_header: true, align: "right" },
          ], [{ text: "A" }, { text: "1", align: "right" }]],
        },
        {
          type: "details",
          summary: "更多",
          is_open: true,
          blocks: [{ type: "paragraph", text: "折叠正文" }],
        },
        { type: "mathematical_expression", expression: "E = mc^2" },
        {
          type: "collage",
          blocks: [
            {
              type: "photo",
              photo: [{ file_id: "small", file_unique_id: "p1", file_size: 10 }, { file_id: "large", file_unique_id: "p2", file_size: 20 }],
              caption: { text: "图片说明", credit: "摄影者" },
            },
            {
              type: "document",
              document: { file_id: "document", file_unique_id: "d1", file_name: "guide.pdf", mime_type: "application/pdf" },
              caption: { text: "文件说明" },
            },
          ],
        },
      ],
    },
  });

  assert.match(content.html, /tg-rich-heading-1/);
  assert.match(content.html, /&lt;富文本标题&gt;/);
  assert.match(content.html, /href="https:\/\/example\.com\/docs\?a=1&amp;b=2"/);
  assert.doesNotMatch(content.html, /javascript:|onclick="x"/);
  assert.match(content.html, /<ul class="tg-rich-list">/);
  assert.match(content.html, /<blockquote>/);
  assert.match(content.html, /<pre><code data-language="ts&quot; onclick=&quot;x">/);
  assert.match(content.html, /tg-rich-table-scroll/);
  assert.match(content.html, /<details open>/);
  assert.match(content.html, /E = mc\^2/);
  assert.match(content.plainText, /<富文本标题> 官网[\s\S]*正文 #Rich[\s\S]*第一项[\s\S]*数据表[\s\S]*折叠正文/);
  assert.deepEqual(content.media.map((item) => ({ type: item.type, fileId: item.fileId, title: item.title, description: item.description })), [
    { type: "photo", fileId: "large", title: undefined, description: "图片说明 — 摄影者" },
    { type: "file", fileId: "document", title: "guide.pdf", description: "文件说明" },
  ]);
});

test("date and stable IDs preserve existing links", () => {
  assert.deepEqual(shanghaiDate(0), {
    date: "1970-01-01",
    datetime: "1970-01-01T08:00:00+08:00",
    year: "1970",
    month: "1970-01",
  });
  assert.equal(stableMessageId("geekshare", 42), "message42");
  assert.equal(stableMessageId("xgeekshare", 42), "xgeekshare_42");
  assert.equal(stableMessageId("tl_gc", 42), "tl_gc_42");
});

test("tags are normalized and deduplicated", () => {
  assert.deepEqual(extractTags("#Cloudflare 内容 #cloudflare #中文标签"), [
    "cloudflare",
    "中文标签",
  ]);
});

test("largest Telegram photo is selected and marked pending", () => {
  const media = messageMedia({
    message_id: 7,
    date: 0,
    chat: { id: -1001 },
    photo: [
      { file_id: "small", file_unique_id: "a", file_size: 100 },
      { file_id: "large", file_unique_id: "b", file_size: 200 },
    ],
  });
  assert.equal(media[0]?.fileId, "large");
  assert.equal(media[0]?.archiveStatus, "pending");
});

test("embed parser reads background image style, never the post href", () => {
  const html = `<a class="tgme_widget_message_photo_wrap" href="https://t.me/test/1"
    style="background-image:url('https://cdn.example/file.jpg?x=1&amp;y=2')"></a>`;
  assert.equal(mediaUrlFromEmbed(html), "https://cdn.example/file.jpg?x=1&y=2");
});

test("getFile media is streamed to a deterministic R2 key", async (context) => {
  const puts: Array<{ key: string; streamed: boolean }> = [];
  const env = {
    TELEGRAM_BOT_TOKEN: "token",
    MEDIA: {
      head: async () => null,
      put: async (key: string, value: ReadableStream) => {
        puts.push({ key, streamed: value instanceof ReadableStream });
        return { key, size: 5 };
      },
    },
  } as unknown as Env;
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/getFile")) {
      return Response.json({
        ok: true,
        result: { file_path: "photos/a.jpg", file_size: 20 * 1024 * 1024 },
      });
    }
    return new Response("bytes", { headers: { "Content-Type": "image/jpeg" } });
  });
  const result = await archiveMedia(
    env,
    [
      {
        type: "photo",
        archiveStatus: "pending",
        fileId: "file-id",
        fileUniqueId: "unique",
        size: 20 * 1024 * 1024,
      },
    ],
    "geekshare",
    "xgeekshare",
    123,
  );
  assert.deepEqual(puts, [
    { key: "channels/geekshare/123/unique.jpg", streamed: true },
  ]);
  assert.equal(result[0]?.archiveStatus, "archived");
});

test("files above 20 MiB use the single-post embed fallback", async (context) => {
  const keys: string[] = [];
  const env = {
    TELEGRAM_BOT_TOKEN: "token",
    MEDIA: {
      head: async () => null,
      put: async (key: string) => {
        keys.push(key);
        return { key, size: 4 };
      },
    },
  } as unknown as Env;
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("?embed=1")) {
      return new Response(
        '<a class="tgme_widget_message_photo_wrap" style="background-image:url(\'https://cdn.example/large.webp\')"></a>',
      );
    }
    return new Response("data", { headers: { "Content-Type": "image/webp" } });
  });
  await archiveMedia(
    env,
    [
      {
        type: "photo",
        archiveStatus: "pending",
        fileId: "large-file",
        fileUniqueId: "large-unique",
        size: 20 * 1024 * 1024 + 1,
      },
    ],
    "tl_gc",
    "tl_gc",
    7601,
  );
  assert.deepEqual(keys, ["channels/tl_gc/7601/large-unique.webp"]);
});
