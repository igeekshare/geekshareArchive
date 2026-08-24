import { absoluteMediaUrl, safeJsonParse } from "./runtime";

export type ArchiveStatus = "archived" | "external" | "pending" | "failed";

export interface StoredMedia {
  type: "photo" | "video" | "file" | "link";
  r2Key?: string;
  thumbKey?: string;
  sourceUrl?: string;
  mimeType?: string;
  size?: number;
  title?: string;
  description?: string;
  archiveStatus: ArchiveStatus;
  fileId?: string;
  fileUniqueId?: string;
  fileName?: string;
  thumbFileId?: string;
  thumbFileUniqueId?: string;
  thumbSize?: number;
  thumbMimeType?: string;
}

export interface PublicMedia extends Omit<
  StoredMedia,
  | "fileId"
  | "fileUniqueId"
  | "fileName"
  | "thumbFileId"
  | "thumbFileUniqueId"
  | "thumbSize"
  | "thumbMimeType"
> {
  url?: string;
  thumb?: string;
}

export interface MessageRow {
  id: string;
  channel_id: string;
  telegram_message_id: number;
  source_url: string;
  date: string;
  datetime: string | null;
  published_at: number;
  published_year: string;
  published_month: string;
  sender: string | null;
  html: string;
  plain_text: string;
  media: string;
  reply_to: string | null;
  reactions: string;
  media_archive_status: string;
  display_title: string | null;
  display_summary: string | null;
  is_featured: number;
  featured_order: number;
  engagement_score: number;
  tags: string;
  channel_title: string;
  channel_username: string;
  channel_avatar_key: string | null;
}

export interface PublicMessage {
  id: string;
  channelId: string;
  telegramMessageId: number;
  sourceUrl: string;
  date: string;
  datetime?: string;
  from: string;
  text: string;
  plainText: string;
  title: string;
  titleHtml?: string;
  summary: string;
  tags: string[];
  media: PublicMedia | null;
  mediaItems: PublicMedia[];
  replyTo: string | null;
  reactions: Array<{ emoji: string; count: string }> | null;
  archiveStatus: "archived" | "external" | "pending" | "failed" | "none";
  isFeatured: boolean;
  featuredOrder: number;
  engagementScore: number;
  channel: {
    title: string;
    username: string;
    avatarUrl?: string;
  };
}

function truncateCharacters(value: string, limit: number): string {
  const characters = [...value.trim()];
  return characters.length > limit ? `${characters.slice(0, limit).join("")}…` : characters.join("");
}

type PresentationLine = {
  html: string;
  text: string;
};

export type MessagePresentation = {
  title: string;
  titleHtml: string;
  bodyHtml: string;
  bodyPlainText: string;
};

const HASHTAG_ONLY_LINE = /^(?:#[\p{L}\p{N}_-]{1,64}\s*)+$/u;
const SIGNATURE_ONLY_LINE = /^(?:(?:📮\uFE0F?\s*投稿|📢\uFE0F?\s*频道|💬\uFE0F?\s*吹水|🌐\uFE0F?\s*网站)\s*)+$/u;
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: "\u00a0",
    quot: '"',
  };
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z][\w-]*));/giu, (entity, decimal, hexadecimal, name) => {
    if (decimal) {
      const codePoint = Number(decimal);
      return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    if (hexadecimal) {
      const codePoint = Number.parseInt(hexadecimal, 16);
      return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    return named[String(name).toLocaleLowerCase()] ?? entity;
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plainTextToHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function htmlTagName(token: string): string | null {
  return token.match(/^<\s*\/?\s*([a-z][\w-]*)/i)?.[1]?.toLocaleLowerCase() ?? null;
}

function splitPresentationLines(value: string): PresentationLine[] {
  const lines: PresentationLine[] = [];
  const openTags: Array<{ name: string; token: string }> = [];
  let html = "";
  let text = "";
  let preDepth = 0;

  const finishLine = () => {
    lines.push({
      html: `${html}${openTags.slice().reverse().map(({ name }) => `</${name}>`).join("")}`,
      text,
    });
    html = openTags.map(({ token }) => token).join("");
    text = "";
  };

  for (const match of value.matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)) {
    const token = match[0];
    if (token.startsWith("<!--")) continue;
    if (!token.startsWith("<")) {
      html += token;
      text += decodeHtmlEntities(token);
      continue;
    }

    const name = htmlTagName(token);
    const closing = /^<\s*\//.test(token);
    if (name === "br" && !closing && preDepth === 0) {
      finishLine();
      continue;
    }

    html += token;
    if (!name) continue;
    if (name === "br" && preDepth > 0) {
      text += "\n";
      continue;
    }
    if (closing) {
      const index = openTags.map(({ name: openName }) => openName).lastIndexOf(name);
      if (index >= 0) openTags.splice(index, 1);
      preDepth = openTags.filter(({ name: openName }) => openName === "pre").length;
      continue;
    }
    if (!VOID_TAGS.has(name) && !/\/\s*>$/.test(token)) {
      openTags.push({ name, token });
      if (name === "pre") preDepth += 1;
    }
  }
  finishLine();
  return lines;
}

function trimEmptyLines(lines: PresentationLine[]): PresentationLine[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].text.trim()) start += 1;
  while (end > start && !lines[end - 1].text.trim()) end -= 1;
  return lines.slice(start, end);
}

function removeTrailingSignature(lines: PresentationLine[]): PresentationLine[] {
  const result = trimEmptyLines(lines);
  while (result.length) {
    const last = result.at(-1)!;
    if (!SIGNATURE_ONLY_LINE.test(last.text.trim())) break;
    result.pop();
    while (result.length && !result.at(-1)!.text.trim()) result.pop();
  }
  return result;
}

function normalizedTitleText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function flattenTitleLinks(value: string): string {
  let html = "";
  for (const match of value.matchAll(/<[^>]*>|[^<]+/g)) {
    const token = match[0];
    if (token.startsWith("<") && htmlTagName(token) === "a") continue;
    html += token;
  }
  return html.trim();
}

function truncateHtml(value: string, limit: number): { html: string; text: string } {
  const completeText = normalizedTitleText(
    splitPresentationLines(value).map((line) => line.text).join(" "),
  );
  if ([...completeText].length <= limit) {
    return { html: value.trim(), text: completeText };
  }

  const openTags: string[] = [];
  let html = "";
  let length = 0;
  let truncated = false;

  outer: for (const match of value.matchAll(/<[^>]*>|[^<]+/g)) {
    const token = match[0];
    if (token.startsWith("<")) {
      const name = htmlTagName(token);
      const closing = /^<\s*\//.test(token);
      html += token;
      if (!name || VOID_TAGS.has(name)) continue;
      if (closing) {
        const index = openTags.lastIndexOf(name);
        if (index >= 0) openTags.splice(index, 1);
      } else if (!/\/\s*>$/.test(token)) {
        openTags.push(name);
      }
      continue;
    }

    for (const unit of token.matchAll(/&(?:#\d+|#x[\da-f]+|[a-z][\w-]*);|[\s\S]/giu)) {
      const characters = [...decodeHtmlEntities(unit[0])];
      if (length + characters.length > limit) {
        truncated = true;
        break outer;
      }
      html += unit[0];
      length += characters.length;
    }
  }

  if (truncated) html += "…";
  html += openTags.slice().reverse().map((name) => `</${name}>`).join("");
  return {
    html: html.trim(),
    text: normalizedTitleText(
      splitPresentationLines(html).map((line) => line.text).join(" "),
    ),
  };
}

function cleanedPlainLines(value: string): string[] {
  const lines = value
    .split(/\r?\n/)
    .filter((line) => !HASHTAG_ONLY_LINE.test(line.trim()))
    .map((line) => ({ html: "", text: line }));
  return removeTrailingSignature(lines).map((line) => line.text.trim()).filter(Boolean);
}

export function deriveMessagePresentation(html: string, plainText: string): MessagePresentation {
  const sourceHtml = html.trim() ? html : plainTextToHtml(plainText);
  const withoutTags = splitPresentationLines(sourceHtml)
    .filter((line) => !HASHTAG_ONLY_LINE.test(line.text.trim()));
  const contentLines = trimEmptyLines(removeTrailingSignature(withoutTags));
  const titleIndex = contentLines.findIndex((line) => Boolean(line.text.trim()));

  if (titleIndex < 0) {
    return {
      title: "媒体内容",
      titleHtml: "媒体内容",
      bodyHtml: "",
      bodyPlainText: "",
    };
  }

  const richTitle = truncateHtml(contentLines[titleIndex].html, 72);
  const bodyLines = trimEmptyLines([
    ...contentLines.slice(0, titleIndex),
    ...contentLines.slice(titleIndex + 1),
  ]);

  return {
    title: richTitle.text || "媒体内容",
    titleHtml: flattenTitleLinks(richTitle.html) || "媒体内容",
    bodyHtml: bodyLines.map((line) => line.html).join("<br>").trim(),
    bodyPlainText: bodyLines.map((line) => line.text).join("\n").trim(),
  };
}

export function deriveDisplayTitle(value: string): string {
  return deriveMessagePresentation("", value).title;
}

export function deriveDisplaySummary(value: string, title?: string): string {
  const normalized = cleanedPlainLines(value).join(" ").replace(/\s+/g, " ").trim();
  const withoutTitle = title && normalized.startsWith(title)
    ? normalized.slice(title.length).replace(/^[\s:：—-]+/, "")
    : normalized;
  const cleanRemainder = withoutTitle.replace(/^(?:#[\p{L}\p{N}_-]+\s*)+$/u, "").trim();
  const cleanNormalized = normalized.replace(/(?:\s*#[\p{L}\p{N}_-]+)+\s*$/u, "").trim();
  return truncateCharacters(cleanRemainder || cleanNormalized || normalized || "这是一条媒体归档内容。", 180);
}

export function messageRowToPublic(
  row: MessageRow,
  mediaBaseUrl: string,
  options: { content?: "public" | "raw" } = {},
): PublicMessage {
  const stored = safeJsonParse<StoredMedia[]>(row.media, []);
  const media = stored.map(
    ({
      fileId: _fileId,
      fileUniqueId: _unique,
      fileName: _name,
      thumbFileId: _thumbFileId,
      thumbFileUniqueId: _thumbUnique,
      thumbSize: _thumbSize,
      thumbMimeType: _thumbMime,
      ...item
    }) => ({
      ...item,
      url: absoluteMediaUrl(mediaBaseUrl, item.r2Key) ?? item.sourceUrl,
      thumb: absoluteMediaUrl(mediaBaseUrl, item.thumbKey),
    }),
  );
  const reactions = safeJsonParse<Array<{ emoji: string; count: number | string }>>(
    row.reactions,
    [],
  ).map((reaction) => ({ emoji: reaction.emoji, count: String(reaction.count) }));
  const presentation = deriveMessagePresentation(row.html, row.plain_text);
  const displayTitle = row.display_title?.trim();
  const title = displayTitle || presentation.title;
  const titleHtml = displayTitle ? escapeHtml(displayTitle) : presentation.titleHtml;
  const publicContent = options.content !== "raw";

  return {
    id: row.id,
    channelId: row.channel_id,
    telegramMessageId: row.telegram_message_id,
    sourceUrl: row.source_url,
    date: row.date,
    datetime: row.datetime ?? undefined,
    from: row.sender ?? row.channel_title,
    text: publicContent ? presentation.bodyHtml : row.html,
    plainText: publicContent ? presentation.bodyPlainText : row.plain_text,
    title,
    titleHtml,
    summary: row.display_summary?.trim() || deriveDisplaySummary(presentation.bodyPlainText),
    tags: safeJsonParse<string[]>(row.tags, []),
    media: media[0] ?? null,
    mediaItems: media,
    replyTo: row.reply_to,
    reactions: reactions.length ? reactions : null,
    archiveStatus: row.media_archive_status as PublicMessage["archiveStatus"],
    isFeatured: Boolean(row.is_featured),
    featuredOrder: Number(row.featured_order ?? 0),
    engagementScore: Number(row.engagement_score ?? 0),
    channel: {
      title: row.channel_title,
      username: row.channel_username,
      avatarUrl: absoluteMediaUrl(mediaBaseUrl, row.channel_avatar_key ?? undefined),
    },
  };
}

export const MESSAGE_SELECT = `
  SELECT m.id, m.channel_id, m.telegram_message_id, m.source_url,
         m.date, m.datetime, m.published_at, m.published_year,
         m.published_month, m.sender, m.html, m.plain_text, m.media,
         m.reply_to, m.reactions, m.media_archive_status,
         m.display_title, m.display_summary, m.is_featured,
         m.featured_order, m.engagement_score,
         COALESCE((SELECT json_group_array(mt.tag)
                   FROM message_tags mt WHERE mt.message_id = m.id), '[]') AS tags,
         c.title AS channel_title, c.username AS channel_username,
         c.avatar_key AS channel_avatar_key
  FROM messages m
  JOIN channels c ON c.id = m.channel_id`;
