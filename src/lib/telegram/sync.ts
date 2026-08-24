import { prisma } from "@/lib/prisma";
import { fetchTelegramChannelHtml } from "@/lib/telegram/fetch";
import { parseTelegramChannelHtml } from "@/lib/telegram/parse";
import { parseTelegramChannelProfileHtml } from "@/lib/telegram/profile";
import type {
  ParsedTelegramMessage,
  TelegramSyncOptions,
  TelegramSyncResult,
} from "@/lib/telegram/types";
import {
  normalizeTelegramUsername,
  telegramChannelIdFor,
} from "@/lib/telegram/username";

function messageIdFor(channelId: string, telegramMessageId: string): string {
  return channelId === "geekshare" || channelId === "xgeekshare"
    ? `message${telegramMessageId}`
    : `${channelId}_${telegramMessageId}`;
}

function serializeJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return JSON.stringify(value);
}

function buildMessageData(channelId: string, message: ParsedTelegramMessage) {
  return {
    channelId,
    telegramMessageId: message.telegramMessageId,
    sourceUrl: message.sourceUrl,
    date: message.date,
    datetime: message.datetime,
    from: "Telegram",
    text: message.html || message.text,
    media: serializeJson(message.media),
    replyTo: message.replyTo,
    reactions: serializeJson(message.reactions),
    tags: serializeJson(message.tags),
  };
}

export async function syncTelegramChannel(
  channelUsername: string,
  options: TelegramSyncOptions = {},
): Promise<TelegramSyncResult> {
  const username = normalizeTelegramUsername(channelUsername);
  const channelId = telegramChannelIdFor(username);
  const source = `https://t.me/s/${username}`;

  const channel = await prisma.channel.upsert({
    where: { id: channelId },
    update: {
      slug: channelId,
      username,
      telegramUrl: `https://t.me/${username}`,
    },
    create: {
      id: channelId,
      slug: channelId,
      title: username,
      username,
      telegramUrl: `https://t.me/${username}`,
      description: `Telegram public channel @${username}`,
    },
  });

  const syncLog = await prisma.syncLog.create({
    data: {
      channelId: channel.id,
      source,
      status: "running",
      parsedCount: 0,
      importedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    },
  });

  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let parsedCount = 0;

  try {
    const { html, url } = await fetchTelegramChannelHtml(username, options);
    const parsed = parseTelegramChannelHtml(html);
    let profile: ReturnType<typeof parseTelegramChannelProfileHtml> | null = null;
    try {
      profile = parseTelegramChannelProfileHtml(html, username);
    } catch (error) {
      console.warn(
        `Could not refresh Telegram profile for @${username}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    parsedCount = parsed.messages.length;
    skippedCount += parsed.skipped.length;

    for (const message of parsed.messages) {
      try {
        const existing = await prisma.message.findUnique({
          where: {
            channelId_telegramMessageId: {
              channelId: channel.id,
              telegramMessageId: message.telegramMessageId,
            },
          },
          select: { id: true },
        });

        const data = buildMessageData(channel.id, message);

        if (existing) {
          await prisma.message.update({
            where: { id: existing.id },
            data,
          });
          updatedCount++;
        } else {
          await prisma.message.create({
            data: {
              id: messageIdFor(channel.id, message.telegramMessageId),
              ...data,
              status: "published",
            },
          });
          importedCount++;
        }
      } catch (error) {
        failedCount++;
        console.warn(
          `Skipped Telegram message ${message.telegramMessageId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const latestParsedMessageId = parsed.messages.reduce<string | null>(
      (latest, message) => {
        if (!latest) return message.telegramMessageId;
        return BigInt(message.telegramMessageId) > BigInt(latest)
          ? message.telegramMessageId
          : latest;
      },
      null,
    );
    const lastSyncedMessageId =
      channel.lastSyncedMessageId && latestParsedMessageId
        ? BigInt(channel.lastSyncedMessageId) > BigInt(latestParsedMessageId)
          ? channel.lastSyncedMessageId
          : latestParsedMessageId
        : channel.lastSyncedMessageId ?? latestParsedMessageId;

    await prisma.$transaction([
      prisma.channel.update({
        where: { id: channel.id },
        data: {
          title:
            profile && channel.title === username ? profile.title : channel.title,
          description:
            profile &&
            channel.description === `Telegram public channel @${username}`
              ? profile.description
              : channel.description,
          avatarUrl: channel.avatarUrl ?? profile?.avatarUrl,
          lastSyncedAt: new Date(),
          lastSyncedMessageId,
        },
      }),
      prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          source: url,
          status: failedCount > 0 ? "partial" : "success",
          parsedCount,
          importedCount,
          updatedCount,
          skippedCount,
          failedCount,
          finishedAt: new Date(),
        },
      }),
    ]);

    return {
      channelId: channel.id,
      channelUsername: username,
      source: url,
      importedCount,
      updatedCount,
      skippedCount,
      failedCount,
      parsedCount,
      syncLogId: syncLog.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "failed",
        errorMessage,
        message: errorMessage,
        importedCount,
        updatedCount,
        skippedCount,
        parsedCount,
        failedCount: Math.max(failedCount, 1),
        finishedAt: new Date(),
      },
    });

    throw error;
  }
}
