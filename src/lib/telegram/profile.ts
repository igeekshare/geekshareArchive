import * as cheerio from "cheerio";
import { fetchTelegramChannelHtml } from "@/lib/telegram/fetch";
import type { TelegramChannelProfile } from "@/lib/telegram/types";
import { normalizeTelegramUsername } from "@/lib/telegram/username";

function absoluteUrl(value: string | undefined): string | null {
  if (!value) return null;

  try {
    return new URL(value, "https://t.me").toString();
  } catch {
    return null;
  }
}

export function parseTelegramChannelProfileHtml(
  html: string,
  channelUsername: string,
): TelegramChannelProfile {
  const username = normalizeTelegramUsername(channelUsername);
  const $ = cheerio.load(html);
  const title = $(".tgme_channel_info_header_title").first().text().trim();
  const description =
    $(".tgme_channel_info_description").first().text().trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    null;
  const avatarUrl = absoluteUrl(
    $(".tgme_page_photo_image").first().attr("src") ||
      $('meta[property="og:image"]').attr("content"),
  );

  if (!title) {
    throw new Error("Telegram channel profile could not be parsed.");
  }

  return {
    username,
    title,
    description,
    avatarUrl,
    telegramUrl: `https://t.me/${username}`,
  };
}

export async function getTelegramChannelProfile(
  channelUsername: string,
): Promise<TelegramChannelProfile> {
  const username = normalizeTelegramUsername(channelUsername);
  const { html } = await fetchTelegramChannelHtml(username);
  return parseTelegramChannelProfileHtml(html, username);
}
