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
    return ["http:", "https:", "tg:", "mailto:"].includes(url.protocol)
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
  return channelId === "geekshare" || channelId === "xgeekshare"
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

export function messageMedia(message: TelegramMessage): StoredMedia[] {
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
  const file = selected.file;
  return [
    {
      type: selected.type,
      mimeType: file.mime_type,
      size: file.file_size,
      title: file.file_name,
      archiveStatus: "pending",
      fileId: file.file_id,
      fileUniqueId: file.file_unique_id,
      fileName: file.file_name,
      thumbFileId: file.thumbnail?.file_id,
      thumbFileUniqueId: file.thumbnail?.file_unique_id,
      thumbSize: file.thumbnail?.file_size,
      thumbMimeType: file.thumbnail?.mime_type,
    },
  ];
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
  try {
    const file = await telegramApi<{ file_path?: string; file_size?: number }>(
      env,
      "getFile",
      { file_id: item.thumbFileId },
    );
    if (!file.file_path || (file.file_size ?? item.thumbSize ?? 0) > TELEGRAM_FILE_LIMIT) {
      return item.thumbKey;
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
  } catch {
    return item.thumbKey;
  }
}

export async function archiveMedia(
  env: Env,
  media: StoredMedia[],
  channelId: string,
  channelUsername: string,
  telegramMessageId: number,
): Promise<StoredMedia[]> {
  const archived: StoredMedia[] = [];
  for (const item of media) {
    if (item.archiveStatus === "external" || item.archiveStatus === "archived") {
      archived.push(item);
      continue;
    }
    if (!item.fileId || !item.fileUniqueId) {
      throw new Error("Telegram media file identifier is missing");
    }
    const keyPrefix = `channels/${channelId}/${telegramMessageId}/${item.fileUniqueId}`;
    let result: StoredMedia;
    if ((item.size ?? 0) > TELEGRAM_FILE_LIMIT) {
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
      thumbKey: await archiveThumbnail(
        env,
        item,
        channelId,
        telegramMessageId,
      ),
    });
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
