import type { Env } from "./runtime";
import type { StoredMedia } from "./models";

const TELEGRAM_FILE_LIMIT = 20 * 1024 * 1024;

export interface TelegramEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
}

export interface TelegramFileRef {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  width?: number;
  height?: number;
  mime_type?: string;
  file_name?: string;
  thumbnail?: TelegramFileRef;
}

export type TelegramRichText =
  | string
  | TelegramRichText[]
  | {
      type: string;
      text?: TelegramRichText;
      alternative_text?: string;
      expression?: string;
      url?: string;
      email_address?: string;
      phone_number?: string;
      username?: string;
      anchor_name?: string;
      reference_name?: string;
      name?: string;
      user?: { id: number | string };
      button?: TelegramRichMessageButton;
    };

export interface TelegramRichMessageButton {
  text: TelegramRichText;
  url?: string;
  web_app?: { url?: string };
  login_url?: { url?: string };
  disabled?: unknown;
}

export interface TelegramRichBlockCaption {
  text: TelegramRichText;
  credit?: TelegramRichText;
}

export interface TelegramRichBlock {
  type: string;
  text?: TelegramRichText;
  credit?: TelegramRichText;
  summary?: TelegramRichText;
  caption?: TelegramRichBlockCaption | TelegramRichText;
  expression?: string;
  language?: string;
  name?: string;
  size?: number;
  is_open?: boolean;
  is_bordered?: boolean;
  is_striped?: boolean;
  is_compact?: boolean;
  blocks?: TelegramRichBlock[];
  items?: Array<{
    label?: string;
    blocks?: TelegramRichBlock[];
    has_checkbox?: boolean;
    is_checked?: boolean;
    value?: number;
    type?: string;
  }>;
  cells?: Array<Array<{
    text?: TelegramRichText;
    is_header?: boolean;
    colspan?: number;
    rowspan?: number;
    align?: string;
    valign?: string;
  }>>;
  buttons?: TelegramRichMessageButton[];
  location?: { latitude?: number; longitude?: number };
  zoom?: number;
  animation?: TelegramFileRef;
  audio?: TelegramFileRef;
  document?: TelegramFileRef;
  photo?: TelegramFileRef[];
  video?: TelegramFileRef;
  voice_note?: TelegramFileRef;
}

export interface TelegramRichMessage {
  blocks: TelegramRichBlock[];
  is_rtl?: boolean;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  edit_date?: number;
  chat: { id: number | string; title?: string; username?: string; type?: string };
  sender_chat?: { title?: string; username?: string };
  text?: string;
  caption?: string;
  entities?: TelegramEntity[];
  caption_entities?: TelegramEntity[];
  reply_to_message?: Pick<TelegramMessage, "message_id">;
  photo?: TelegramFileRef[];
  video?: TelegramFileRef;
  animation?: TelegramFileRef;
  document?: TelegramFileRef;
  audio?: TelegramFileRef;
  voice?: TelegramFileRef;
  video_note?: TelegramFileRef;
  sticker?: TelegramFileRef;
  rich_message?: TelegramRichMessage;
}

export interface TelegramReactionUpdate {
  chat: TelegramMessage["chat"];
  message_id: number;
  date: number;
  reactions: Array<{
    type: { type: string; emoji?: string; custom_emoji_id?: string };
    total_count: number;
  }>;
}

export interface TelegramUpdate {
  update_id: number;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  message_reaction_count?: TelegramReactionUpdate;
}

export class MediaArchiveError extends Error {
  constructor(
    message: string,
    readonly media: StoredMedia[],
    readonly permanent = false,
  ) {
    super(message);
    this.name = "MediaArchiveError";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeHref(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:", "tg:", "mailto:", "tel:"].includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function entityTags(entity: TelegramEntity, source: string): [string, string] | null {
  switch (entity.type) {
    case "bold":
      return ["<strong>", "</strong>"];
    case "italic":
      return ["<em>", "</em>"];
    case "underline":
      return ["<u>", "</u>"];
    case "strikethrough":
      return ["<s>", "</s>"];
    case "code":
      return ["<code>", "</code>"];
    case "pre":
      return ["<pre><code>", "</code></pre>"];
    case "spoiler":
      return ['<span class="tg-spoiler">', "</span>"];
    case "text_link": {
      const href = entity.url ? safeHref(entity.url) : null;
      return href
        ? [`<a href="${escapeHtml(href)}" rel="noopener noreferrer">`, "</a>"]
        : null;
    }
    case "url": {
      const href = safeHref(source.slice(entity.offset, entity.offset + entity.length));
      return href
        ? [`<a href="${escapeHtml(href)}" rel="noopener noreferrer">`, "</a>"]
        : null;
    }
    case "email": {
      const address = source.slice(entity.offset, entity.offset + entity.length);
      return [`<a href="mailto:${escapeHtml(address)}">`, "</a>"];
    }
    default:
      return null;
  }
}

export function telegramTextToHtml(
  source: string,
  entities: TelegramEntity[] = [],
): string {
  const opens = new Map<number, string[]>();
  const closes = new Map<number, string[]>();

  for (const entity of entities) {
    const start = Math.max(0, Math.min(source.length, entity.offset));
    const end = Math.max(start, Math.min(source.length, start + entity.length));
    const tags = entityTags({ ...entity, offset: start, length: end - start }, source);
    if (!tags || start === end) continue;
    opens.set(start, [...(opens.get(start) ?? []), tags[0]]);
    closes.set(end, [tags[1], ...(closes.get(end) ?? [])]);
  }

  let html = "";
  for (let index = 0; index <= source.length; index += 1) {
    html += (closes.get(index) ?? []).join("");
    html += (opens.get(index) ?? []).join("");
    if (index < source.length) html += escapeHtml(source[index]);
  }
  return html.replaceAll("\n", "<br>");
}

type RenderedRichContent = {
  html: string;
  text: string;
  media: StoredMedia[];
};

export type TelegramMessageContent = {
  html: string;
  plainText: string;
  media: StoredMedia[];
};

const MAX_RICH_DEPTH = 32;

function rendered(html = "", text = "", media: StoredMedia[] = []): RenderedRichContent {
  return { html, text, media };
}

function safeAnchorName(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 80);
  return normalized ? `tg-${normalized}` : null;
}

function wrapInline(tag: string, content: RenderedRichContent, attributes = ""): RenderedRichContent {
  if (!content.html && !content.text) return content;
  return rendered(`<${tag}${attributes}>${content.html}</${tag}>`, content.text, content.media);
}

function safeLink(content: RenderedRichContent, href: string | undefined, className = ""): RenderedRichContent {
  const safe = href ? safeHref(href) : null;
  if (!safe || !content.html) return content;
  const classes = className ? ` class="${className}"` : "";
  return rendered(
    `<a href="${escapeHtml(safe)}" rel="noopener noreferrer"${classes}>${content.html}</a>`,
    content.text,
    content.media,
  );
}

function renderRichButton(button: TelegramRichMessageButton | undefined, depth: number): RenderedRichContent {
  if (!button) return rendered();
  const label = renderRichText(button.text, depth + 1);
  const href = button.url ?? button.web_app?.url ?? button.login_url?.url;
  const linked = safeLink(label, href, "tg-rich-button");
  return linked === label
    ? wrapInline("span", label, ' class="tg-rich-button tg-rich-button--inactive"')
    : linked;
}

function renderRichText(value: TelegramRichText | undefined, depth = 0): RenderedRichContent {
  if (depth > MAX_RICH_DEPTH || value === undefined || value === null) return rendered();
  if (typeof value === "string") {
    const text = value.replace(/\r\n?/g, "\n");
    return rendered(escapeHtml(text).replaceAll("\n", "<br>"), text);
  }
  if (Array.isArray(value)) {
    const parts = value.map((part) => renderRichText(part, depth + 1));
    return rendered(
      parts.map((part) => part.html).join(""),
      parts.map((part) => part.text).join(""),
      parts.flatMap((part) => part.media),
    );
  }
  if (typeof value !== "object") return rendered();

  const inner = renderRichText(value.text, depth + 1);
  switch (value.type) {
    case "bold":
      return wrapInline("strong", inner);
    case "italic":
      return wrapInline("em", inner);
    case "underline":
      return wrapInline("u", inner);
    case "strikethrough":
      return wrapInline("s", inner);
    case "spoiler":
      return wrapInline("span", inner, ' class="tg-spoiler"');
    case "subscript":
      return wrapInline("sub", inner);
    case "superscript":
      return wrapInline("sup", inner);
    case "marked":
      return wrapInline("mark", inner);
    case "code":
      return wrapInline("code", inner);
    case "url":
      return safeLink(inner, value.url);
    case "email_address":
      return safeLink(inner, value.email_address ? `mailto:${value.email_address}` : undefined);
    case "phone_number":
      return safeLink(inner, value.phone_number ? `tel:${value.phone_number}` : undefined);
    case "text_mention":
      return safeLink(inner, value.user?.id === undefined ? undefined : `tg://user?id=${value.user.id}`);
    case "mention":
      return safeLink(
        inner,
        value.username && /^[a-z0-9_]{5,32}$/i.test(value.username)
          ? `https://t.me/${value.username}`
          : undefined,
      );
    case "custom_emoji": {
      const text = value.alternative_text ?? "";
      return rendered(escapeHtml(text), text);
    }
    case "mathematical_expression": {
      const text = value.expression ?? "";
      return rendered(`<code class="tg-rich-math">${escapeHtml(text)}</code>`, text);
    }
    case "button":
      return renderRichButton(value.button, depth + 1);
    case "anchor": {
      const id = safeAnchorName(value.name);
      return id ? rendered(`<span id="${escapeHtml(id)}"></span>`) : rendered();
    }
    case "anchor_link": {
      const id = safeAnchorName(value.anchor_name);
      return id && inner.html
        ? rendered(`<a href="#${escapeHtml(id)}">${inner.html}</a>`, inner.text)
        : inner;
    }
    case "reference": {
      const id = safeAnchorName(value.name);
      return id ? wrapInline("span", inner, ` id="${escapeHtml(id)}"`) : inner;
    }
    case "reference_link": {
      const id = safeAnchorName(value.reference_name);
      return id && inner.html
        ? rendered(`<a href="#${escapeHtml(id)}">${inner.html}</a>`, inner.text)
        : inner;
    }
    default:
      if (value.text !== undefined) return inner;
      if (value.alternative_text) return rendered(escapeHtml(value.alternative_text), value.alternative_text);
      if (value.expression) return rendered(escapeHtml(value.expression), value.expression);
      return rendered();
  }
}

function renderCaption(
  caption: TelegramRichBlockCaption | TelegramRichText | undefined,
  depth: number,
): RenderedRichContent {
  if (caption === undefined) return rendered();
  if (
    caption
    && typeof caption === "object"
    && !Array.isArray(caption)
    && !("type" in caption)
    && "text" in caption
  ) {
    const content = renderRichText(caption.text, depth + 1);
    const credit = renderRichText(caption.credit, depth + 1);
    const html = [content.html, credit.html ? `<cite>${credit.html}</cite>` : ""].filter(Boolean).join(" ");
    const text = [content.text, credit.text].filter(Boolean).join(" — ");
    return rendered(html ? `<span class="tg-rich-caption">${html}</span>` : "", text);
  }
  const content = renderRichText(caption as TelegramRichText, depth + 1);
  return wrapInline("span", content, ' class="tg-rich-caption"');
}

function mediaFromFile(
  type: StoredMedia["type"],
  file: TelegramFileRef | undefined,
  description?: string,
): StoredMedia[] {
  if (!file) return [];
  return [{
    type,
    mimeType: file.mime_type,
    size: file.file_size,
    title: file.file_name,
    description: description || undefined,
    archiveStatus: "pending",
    fileId: file.file_id,
    fileUniqueId: file.file_unique_id,
    fileName: file.file_name,
    thumbFileId: file.thumbnail?.file_id,
    thumbFileUniqueId: file.thumbnail?.file_unique_id,
    thumbSize: file.thumbnail?.file_size,
    thumbMimeType: file.thumbnail?.mime_type,
  }];
}

function renderRichBlocks(
  blocks: TelegramRichBlock[] | undefined,
  depth: number,
  topLevel = false,
): RenderedRichContent {
  if (depth > MAX_RICH_DEPTH || !Array.isArray(blocks)) return rendered();
  const parts = blocks.map((block) => renderRichBlock(block, depth + 1));
  return rendered(
    parts.filter((part) => part.html).map((part) => part.html).join(
      topLevel ? "<br>" : '<span class="tg-rich-block-break"></span>',
    ),
    parts.filter((part) => part.text).map((part) => part.text).join("\n"),
    parts.flatMap((part) => part.media),
  );
}

function renderRichBlock(block: TelegramRichBlock, depth: number): RenderedRichContent {
  if (depth > MAX_RICH_DEPTH || !block || typeof block !== "object") return rendered();
  const inline = () => renderRichText(block.text, depth + 1);
  const credit = () => renderRichText(block.credit, depth + 1);
  const caption = () => renderCaption(block.caption, depth + 1);
  const nested = () => renderRichBlocks(block.blocks, depth + 1);

  switch (block.type) {
    case "paragraph":
      return inline();
    case "heading": {
      const size = Math.min(6, Math.max(1, Number(block.size) || 2));
      return wrapInline("span", inline(), ` class="tg-rich-heading tg-rich-heading-${size}"`);
    }
    case "pre": {
      const content = inline();
      const language = block.language?.trim().slice(0, 40);
      const attribute = language ? ` data-language="${escapeHtml(language)}"` : "";
      return rendered(`<pre><code${attribute}>${escapeHtml(content.text)}</code></pre>`, content.text);
    }
    case "footer":
      return wrapInline("small", inline(), ' class="tg-rich-footer"');
    case "divider":
      return rendered('<hr class="tg-rich-divider">');
    case "mathematical_expression": {
      const expression = block.expression ?? "";
      return rendered(`<code class="tg-rich-math tg-rich-math--block">${escapeHtml(expression)}</code>`, expression);
    }
    case "anchor": {
      const id = safeAnchorName(block.name);
      return id ? rendered(`<span id="${escapeHtml(id)}"></span>`) : rendered();
    }
    case "list": {
      const items = Array.isArray(block.items) ? block.items : [];
      const ordered = items.some((item) => Number.isInteger(item.value) || ["1", "a", "A", "i", "I"].includes(item.type ?? ""));
      const tag = ordered ? "ol" : "ul";
      const listType = ordered ? items.find((item) => ["1", "a", "A", "i", "I"].includes(item.type ?? ""))?.type : undefined;
      const renderedItems = items.map((item, index) => {
        const content = renderRichBlocks(item.blocks, depth + 1);
        const checkbox = item.has_checkbox ? (item.is_checked ? "☑" : "☐") : "";
        const value = ordered && Number.isInteger(item.value) ? ` value="${Math.max(1, Number(item.value))}"` : "";
        const html = `<li${value}>${checkbox ? `<span class="tg-rich-checkbox" aria-hidden="true">${checkbox}</span>` : ""}${content.html}</li>`;
        const label = checkbox || item.label?.trim() || (ordered ? `${item.value ?? index + 1}.` : "•");
        return rendered(html, `${label} ${content.text}`.trim(), content.media);
      });
      const typeAttribute = listType ? ` type="${listType}"` : "";
      return rendered(
        `<${tag} class="tg-rich-list"${typeAttribute}>${renderedItems.map((item) => item.html).join("")}</${tag}>`,
        renderedItems.map((item) => item.text).join("\n"),
        renderedItems.flatMap((item) => item.media),
      );
    }
    case "blockquote": {
      const content = nested();
      const attribution = credit();
      return rendered(
        `<blockquote>${content.html}${attribution.html ? `<footer>${attribution.html}</footer>` : ""}</blockquote>`,
        content.text.split("\n").map((line) => `> ${line}`).join("\n") + (attribution.text ? `\n— ${attribution.text}` : ""),
        content.media,
      );
    }
    case "expandable_blockquote": {
      const content = inline();
      const attribution = credit();
      return rendered(
        `<details class="tg-rich-quote"><summary>展开引用</summary><blockquote>${content.html}${attribution.html ? `<footer>${attribution.html}</footer>` : ""}</blockquote></details>`,
        `${content.text}${attribution.text ? `\n— ${attribution.text}` : ""}`,
      );
    }
    case "pullquote": {
      const content = inline();
      const attribution = credit();
      return rendered(
        `<blockquote class="tg-rich-pullquote">${content.html}${attribution.html ? `<footer>${attribution.html}</footer>` : ""}</blockquote>`,
        `${content.text}${attribution.text ? `\n— ${attribution.text}` : ""}`,
      );
    }
    case "collage":
    case "slideshow": {
      const content = nested();
      const note = caption();
      return rendered(
        [content.html, note.html].filter(Boolean).join("<br>"),
        [content.text, note.text].filter(Boolean).join("\n"),
        content.media,
      );
    }
    case "table": {
      const rows = Array.isArray(block.cells) ? block.cells : [];
      const tableCaption = renderRichText(
        typeof block.caption === "object" && block.caption && !Array.isArray(block.caption) && !("type" in block.caption) && "text" in block.caption
          ? block.caption.text
          : block.caption as TelegramRichText | undefined,
        depth + 1,
      );
      const renderedRows = rows.map((row) => row.map((cell) => {
        const content = renderRichText(cell.text, depth + 1);
        const tag = cell.is_header ? "th" : "td";
        const colspan = Number.isInteger(cell.colspan) && Number(cell.colspan) > 1 ? ` colspan="${Math.min(100, Number(cell.colspan))}"` : "";
        const rowspan = Number.isInteger(cell.rowspan) && Number(cell.rowspan) > 1 ? ` rowspan="${Math.min(100, Number(cell.rowspan))}"` : "";
        const align = ["left", "center", "right"].includes(cell.align ?? "") ? ` tg-align-${cell.align}` : "";
        const valign = ["top", "middle", "bottom"].includes(cell.valign ?? "") ? ` tg-valign-${cell.valign}` : "";
        return rendered(`<${tag} class="${`${align}${valign}`.trim()}"${colspan}${rowspan}>${content.html}</${tag}>`, content.text);
      }));
      const classes = ["tg-rich-table", block.is_bordered && "is-bordered", block.is_striped && "is-striped", block.is_compact && "is-compact"].filter(Boolean).join(" ");
      const table = `<div class="tg-rich-table-scroll"><table class="${classes}">${tableCaption.html ? `<caption>${tableCaption.html}</caption>` : ""}<tbody>${renderedRows.map((row) => `<tr>${row.map((cell) => cell.html).join("")}</tr>`).join("")}</tbody></table></div>`;
      return rendered(
        table,
        [tableCaption.text, ...renderedRows.map((row) => row.map((cell) => cell.text).join("\t"))].filter(Boolean).join("\n"),
      );
    }
    case "details": {
      const summary = renderRichText(block.summary, depth + 1);
      const content = nested();
      return rendered(
        `<details${block.is_open ? " open" : ""}><summary>${summary.html || "详细内容"}</summary>${content.html}</details>`,
        [summary.text, content.text].filter(Boolean).join("\n"),
        content.media,
      );
    }
    case "map": {
      const latitude = Number(block.location?.latitude);
      const longitude = Number(block.location?.longitude);
      const note = caption();
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return note;
      const zoom = Math.min(19, Math.max(0, Number(block.zoom) || 14));
      const label = `地图：${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      const link = safeLink(
        rendered(escapeHtml(label), label),
        `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${zoom}/${latitude}/${longitude}`,
      );
      return rendered(
        [link.html, note.html].filter(Boolean).join("<br>"),
        [link.text, note.text].filter(Boolean).join("\n"),
      );
    }
    case "buttons": {
      const buttons = (Array.isArray(block.buttons) ? block.buttons : []).map((button) => renderRichButton(button, depth + 1));
      return rendered(
        `<span class="tg-rich-button-row">${buttons.map((button) => button.html).join(" ")}</span>`,
        buttons.map((button) => button.text).filter(Boolean).join(" "),
      );
    }
    case "animation":
    case "audio":
    case "document":
    case "photo":
    case "video":
    case "voice_note": {
      const note = caption();
      const file = block.type === "photo"
        ? chooseLargest(block.photo)
        : block[block.type as "animation" | "audio" | "document" | "video" | "voice_note"];
      const type: StoredMedia["type"] = block.type === "photo"
        ? "photo"
        : ["video", "animation"].includes(block.type) ? "video" : "file";
      return rendered(note.html, note.text, mediaFromFile(type, file, note.text));
    }
    default: {
      const parts = [inline(), nested(), caption(), renderRichText(block.summary, depth + 1)];
      return rendered(
        parts.filter((part) => part.html).map((part) => part.html).join("<br>"),
        parts.filter((part) => part.text).map((part) => part.text).join("\n"),
        parts.flatMap((part) => part.media),
      );
    }
  }
}

function renderRichMessage(message: TelegramRichMessage): TelegramMessageContent {
  const content = renderRichBlocks(message.blocks, 0, true);
  return { html: content.html, plainText: content.text, media: content.media };
}

export function extractTags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]{1,64})/gu)) {
    tags.add(match[1].toLocaleLowerCase());
  }
  return [...tags].slice(0, 50);
}

export function shanghaiDate(epochSeconds: number): {
  date: string;
  datetime: string;
  year: string;
  month: string;
} {
  const date = new Date(epochSeconds * 1000 + 8 * 60 * 60 * 1000);
  const year = String(date.getUTCFullYear());
  const monthNumber = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return {
    date: `${year}-${monthNumber}-${day}`,
    datetime: `${year}-${monthNumber}-${day}T${hours}:${minutes}:${seconds}+08:00`,
    year,
    month: `${year}-${monthNumber}`,
  };
}

export function stableMessageId(channelId: string, telegramMessageId: number): string {
  return channelId === "geekshare"
    ? `message${telegramMessageId}`
    : `${channelId}_${telegramMessageId}`;
}

function chooseLargest(items: TelegramFileRef[] | undefined): TelegramFileRef | undefined {
  return items?.reduce<TelegramFileRef | undefined>((largest, item) => {
    const score = item.file_size ?? (item.width ?? 0) * (item.height ?? 0);
    const largestScore = largest
      ? largest.file_size ?? (largest.width ?? 0) * (largest.height ?? 0)
      : -1;
    return score > largestScore ? item : largest;
  }, undefined);
}

function legacyMessageMedia(message: TelegramMessage): StoredMedia[] {
  const photo = chooseLargest(message.photo);
  const candidates: Array<{ type: StoredMedia["type"]; file?: TelegramFileRef }> = [
    { type: "photo", file: photo },
    { type: "video", file: message.video ?? message.animation ?? message.video_note },
    {
      type: "file",
      file: message.document ?? message.audio ?? message.voice ?? message.sticker,
    },
  ];
  const selected = candidates.find((candidate) => candidate.file);
  if (!selected?.file) return [];
  return mediaFromFile(selected.type, selected.file);
}

export function messageMedia(message: TelegramMessage): StoredMedia[] {
  return message.rich_message
    ? renderRichMessage(message.rich_message).media
    : legacyMessageMedia(message);
}

export function telegramMessageContent(message: TelegramMessage): TelegramMessageContent {
  if (message.rich_message) return renderRichMessage(message.rich_message);
  const plainText = message.text ?? message.caption ?? "";
  const entities = message.text !== undefined
    ? message.entities ?? []
    : message.caption_entities ?? [];
  return {
    html: telegramTextToHtml(plainText, entities),
    plainText,
    media: legacyMessageMedia(message),
  };
}

export async function telegramApi<T>(
  env: Env,
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const body = (await response.json()) as {
    ok: boolean;
    result?: T;
    description?: string;
  };
  if (!response.ok || !body.ok || body.result === undefined) {
    throw new Error(body.description ?? `Telegram ${method} failed (${response.status})`);
  }
  return body.result;
}

function extensionFor(filePath: string | undefined, media: StoredMedia): string {
  const candidate = filePath ?? media.fileName ?? "";
  const match = candidate.match(/\.([a-zA-Z0-9]{1,8})(?:\?|$)/);
  if (match) return match[1].toLowerCase();
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "application/pdf": "pdf",
  };
  return extensions[media.mimeType ?? ""] ?? (media.type === "photo" ? "jpg" : "bin");
}

function decodeUrl(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"');
}

export function mediaUrlFromEmbed(html: string): string | null {
  const styleMatch = html.match(
    /tgme_widget_message_photo_wrap[^>]+style=["'][^"']*background-image\s*:\s*url\((?:&quot;|["'])?([^)'"&]+(?:&amp;[^)'" ]*)?)/i,
  );
  if (styleMatch?.[1]) return decodeUrl(styleMatch[1]);
  const videoMatch = html.match(
    /<(?:video|source)[^>]+src=["']([^"']+)["']/i,
  );
  return videoMatch?.[1] ? decodeUrl(videoMatch[1]) : null;
}

async function streamToR2(
  env: Env,
  key: string,
  url: string,
  mimeType?: string,
): Promise<{ size?: number; mimeType?: string }> {
  if (await env.MEDIA.head(key)) return { mimeType };
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Media download failed (${response.status})`);
  }
  const contentType = response.headers.get("Content-Type") ?? mimeType ?? undefined;
  const length = Number(response.headers.get("Content-Length"));
  await env.MEDIA.put(key, response.body, {
    httpMetadata: { contentType },
  });
  return {
    size: Number.isFinite(length) && length > 0 ? length : undefined,
    mimeType: contentType,
  };
}

export async function archiveBotFile(
  env: Env,
  fileId: string,
  keyPrefix: string,
  mimeType = "application/octet-stream",
): Promise<string> {
  const file = await telegramApi<{ file_path?: string; file_size?: number }>(
    env,
    "getFile",
    { file_id: fileId },
  );
  if (!file.file_path || (file.file_size ?? 0) > TELEGRAM_FILE_LIMIT) {
    throw new Error("Telegram file is unavailable through getFile");
  }
  const descriptor: StoredMedia = {
    type: "file",
    archiveStatus: "pending",
    mimeType,
  };
  const key = `${keyPrefix}.${extensionFor(file.file_path, descriptor)}`;
  await streamToR2(
    env,
    key,
    `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`,
    mimeType,
  );
  return key;
}

async function archiveFromEmbed(
  env: Env,
  media: StoredMedia,
  channelUsername: string,
  telegramMessageId: number,
  keyPrefix: string,
): Promise<StoredMedia> {
  const response = await fetch(
    `https://t.me/${encodeURIComponent(channelUsername)}/${telegramMessageId}?embed=1&mode=tme`,
  );
  if (!response.ok) throw new Error(`Telegram embed failed (${response.status})`);
  const sourceUrl = mediaUrlFromEmbed(await response.text());
  if (!sourceUrl) throw new Error("No media URL found in Telegram embed");
  const extension = extensionFor(new URL(sourceUrl).pathname, media);
  const key = `${keyPrefix}.${extension}`;
  const stored = await streamToR2(env, key, sourceUrl, media.mimeType);
  return {
    ...media,
    r2Key: key,
    sourceUrl,
    size: stored.size ?? media.size,
    mimeType: stored.mimeType ?? media.mimeType,
    archiveStatus: "archived",
  };
}

async function archiveThumbnail(
  env: Env,
  item: StoredMedia,
  channelId: string,
  telegramMessageId: number,
): Promise<string | undefined> {
  if (!item.thumbFileId || !item.thumbFileUniqueId) return item.thumbKey;
  const file = await telegramApi<{ file_path?: string; file_size?: number }>(
    env,
    "getFile",
    { file_id: item.thumbFileId },
  );
  if (!file.file_path || (file.file_size ?? item.thumbSize ?? 0) > TELEGRAM_FILE_LIMIT) {
    throw new Error("Telegram thumbnail is unavailable through getFile");
  }
  const thumbnail: StoredMedia = {
    type: "photo",
    archiveStatus: "pending",
    mimeType: item.thumbMimeType ?? "image/jpeg",
  };
  const key = `channels/${channelId}/${telegramMessageId}/${item.thumbFileUniqueId}.${extensionFor(
    file.file_path,
    thumbnail,
  )}`;
  await streamToR2(
    env,
    key,
    `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`,
    thumbnail.mimeType,
  );
  return key;
}

export async function archiveMedia(
  env: Env,
  media: StoredMedia[],
  channelId: string,
  channelUsername: string,
  telegramMessageId: number,
): Promise<StoredMedia[]> {
  const archived: StoredMedia[] = [];
  for (let index = 0; index < media.length; index += 1) {
    const item = media[index];
    let result: StoredMedia | undefined;
    try {
      const thumbnailMissing = Boolean(item.thumbFileId && item.thumbFileUniqueId && !item.thumbKey);
      if (
        item.archiveStatus === "external" ||
        (item.archiveStatus === "archived" && !thumbnailMissing)
      ) {
        archived.push(item);
        continue;
      }
      if (item.r2Key && thumbnailMissing && await env.MEDIA.head(item.r2Key)) {
        archived.push({
          ...item,
          thumbKey: await archiveThumbnail(env, item, channelId, telegramMessageId),
          archiveStatus: "archived",
        });
        continue;
      }
      if (!item.fileId || !item.fileUniqueId) {
        throw new Error("Telegram media file identifier is missing");
      }
      const keyPrefix = `channels/${channelId}/${telegramMessageId}/${item.fileUniqueId}`;
      if ((item.size ?? 0) > TELEGRAM_FILE_LIMIT) {
        if (item.type === "file") {
          throw new MediaArchiveError(
            "Oversized Telegram file media is unsupported by the current embed fallback",
            [],
            true,
          );
        }
        result = await archiveFromEmbed(
          env,
          item,
          channelUsername,
          telegramMessageId,
          keyPrefix,
        );
      } else {
        const file = await telegramApi<{ file_path?: string; file_size?: number }>(
          env,
          "getFile",
          { file_id: item.fileId },
        );
        if (!file.file_path || (file.file_size ?? 0) > TELEGRAM_FILE_LIMIT) {
          if ((file.file_size ?? 0) > TELEGRAM_FILE_LIMIT && item.type === "file") {
            throw new MediaArchiveError(
              "Oversized Telegram file media is unsupported by the current embed fallback",
              [],
              true,
            );
          }
          result = await archiveFromEmbed(
            env,
            item,
            channelUsername,
            telegramMessageId,
            keyPrefix,
          );
        } else {
          const extension = extensionFor(file.file_path, item);
          const key = `${keyPrefix}.${extension}`;
          const stored = await streamToR2(
            env,
            key,
            `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`,
            item.mimeType,
          );
          result = {
            ...item,
            r2Key: key,
            size: stored.size ?? file.file_size ?? item.size,
            mimeType: stored.mimeType ?? item.mimeType,
            archiveStatus: "archived",
          };
        }
      }
      archived.push({
        ...result,
        thumbKey: await archiveThumbnail(env, item, channelId, telegramMessageId),
      });
    } catch (error) {
      const partial = result ?? item;
      throw new MediaArchiveError(
        error instanceof Error ? error.message : "Media archive failed",
        [
          ...archived,
          { ...partial, archiveStatus: "failed" },
          ...media.slice(index + 1),
        ],
        error instanceof MediaArchiveError && error.permanent,
      );
    }
  }
  return archived;
}

export async function secretsMatch(actual: string | null, expected: string): Promise<boolean> {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}
