import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type {
  ParsedTelegramMessage,
  TelegramMedia,
  TelegramParseResult,
  TelegramReaction,
} from "@/lib/telegram/types";

const TAG_REGEX = /#([A-Za-z0-9_\u4e00-\u9fa5]+)/g;

function absoluteTelegramUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return new URL(pathOrUrl, "https://t.me").toString();
}

function cleanTelegramHtml(html: string): string {
  return html
    .replace(/\sclass="[^"]*"/g, "")
    .replace(/\sdir="[^"]*"/g, "")
    .replace(/\srel="[^"]*"/g, "")
    .replace(/\starget="[^"]*"/g, "")
    .trim();
}

function formatTelegramDate(datetime: string | null, fallbackTitle: string): string {
  if (!datetime) return fallbackTitle;
  const date = new Date(datetime);
  if (Number.isNaN(date.getTime())) return fallbackTitle || datetime;

  const pad = (value: number) => String(value).padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

function extractTags(text: string): string[] {
  const tags = new Set<string>();
  let match: RegExpExecArray | null;

  TAG_REGEX.lastIndex = 0;
  while ((match = TAG_REGEX.exec(text)) !== null) {
    const tag = match[1].trim();
    if (tag) tags.add(tag);
  }

  return Array.from(tags);
}

function extractBackgroundImageUrl(style: string | undefined): string | null {
  if (!style) return null;
  const match = style.match(/url\(['"]?([^'")]+)['"]?\)/i);
  return match?.[1] ? absoluteTelegramUrl(match[1]) : null;
}

function parseMedia(
  $: cheerio.CheerioAPI,
  message: cheerio.Cheerio<AnyNode>,
): TelegramMedia | null {
  const photo = message.find(".tgme_widget_message_photo_wrap").first();
  const photoUrl =
    extractBackgroundImageUrl(photo.attr("style")) ||
    extractBackgroundImageUrl(photo.find(".tgme_widget_message_photo").attr("style"));

  if (photoUrl) {
    return {
      type: "photo",
      url: absoluteTelegramUrl(photoUrl),
      thumb: absoluteTelegramUrl(photoUrl),
    };
  }

  const video = message.find("video").first();
  const videoUrl = video.attr("src");
  if (videoUrl) {
    const poster = video.attr("poster");
    return {
      type: "video",
      url: absoluteTelegramUrl(videoUrl),
      thumb: poster ? absoluteTelegramUrl(poster) : undefined,
    };
  }

  const preview = message.find(".tgme_widget_message_link_preview").first();
  const previewUrl = preview.attr("href");
  if (previewUrl) {
    const title = preview.find(".link_preview_title").first().text().trim();
    const description = preview
      .find(".link_preview_description")
      .first()
      .text()
      .trim();

    return {
      type: "file",
      url: absoluteTelegramUrl(previewUrl),
      title,
      description,
    };
  }

  return null;
}

function parseReplyTo(message: cheerio.Cheerio<AnyNode>): string | null {
  const replyHref = message
    .find(".tgme_widget_message_reply, .tgme_widget_message_reply_text")
    .first()
    .attr("href");
  if (!replyHref) return null;

  const match = replyHref.match(/\/(\d+)(?:\?|$)/);
  return match?.[1] ? `message${match[1]}` : null;
}

function parseReactions(
  $: cheerio.CheerioAPI,
  message: cheerio.Cheerio<AnyNode>,
): TelegramReaction[] {
  const reactions: TelegramReaction[] = [];

  message.find(".tgme_widget_message_reaction").each((_, element) => {
    const reaction = $(element);
    const emoji = reaction.find(".emoji").first().text().trim() || reaction.text().trim().slice(0, 2);
    const count = reaction.find(".tgme_widget_message_reaction_counter").first().text().trim();

    if (emoji || count) {
      reactions.push({
        emoji,
        count: count || "1",
      });
    }
  });

  return reactions;
}

function parseMessage(
  $: cheerio.CheerioAPI,
  element: Element,
): ParsedTelegramMessage {
  const message = $(element);
  const dataPost = message.attr("data-post");
  const idMatch = dataPost?.match(/\/(\d+)$/);
  const telegramMessageId = idMatch?.[1];
  if (!telegramMessageId) {
    throw new Error("Missing Telegram message id.");
  }

  const dateLink = message.find(".tgme_widget_message_date").first();
  const sourceUrl = absoluteTelegramUrl(
    dateLink.attr("href") || `/${dataPost}`,
  );
  const time = dateLink.find("time").first();
  const datetime = time.attr("datetime") ?? null;
  const dateTitle = dateLink.attr("title") ?? "";
  const textNode = message.find(".tgme_widget_message_text").first();
  const rawHtml = textNode.html() ?? "";
  const html = cleanTelegramHtml(rawHtml);
  const text = html || textNode.text().trim();

  return {
    telegramMessageId,
    sourceUrl,
    date: formatTelegramDate(datetime, dateTitle),
    datetime,
    text,
    html,
    media: parseMedia($, message),
    replyTo: parseReplyTo(message),
    reactions: parseReactions($, message),
    tags: extractTags(textNode.text()),
  };
}

export function parseTelegramChannelHtml(html: string): TelegramParseResult {
  const $ = cheerio.load(html);
  const messages: ParsedTelegramMessage[] = [];
  const skipped: TelegramParseResult["skipped"] = [];

  $(".tgme_widget_message[data-post]").each((_, element) => {
    try {
      messages.push(parseMessage($, element));
    } catch (error) {
      skipped.push({
        source: $(element).attr("data-post"),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  });

  if (messages.length === 0) {
    throw new Error("No Telegram messages were parsed from the channel HTML.");
  }

  return { messages, skipped };
}
