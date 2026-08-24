import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { load } from "cheerio";

const prisma = new PrismaClient();
const stagingRoot = path.join(process.cwd(), ".data", "r2");

function backgroundUrl(style?: string): string | null {
  if (!style) return null;
  const match = style.match(/background-image\s*:\s*url\((?:["'])?([^)'";]+)(?:["'])?\)/i);
  return match?.[1]?.replaceAll("&amp;", "&") ?? null;
}

function extension(url: string, contentType: string | null): string {
  const fromPath = new URL(url).pathname.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1];
  if (fromPath) return fromPath.toLowerCase();
  const known: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return known[contentType?.split(";")[0] ?? ""] ?? "bin";
}

async function repair() {
  const channels = await prisma.channel.findMany({
    where: { avatarUrl: { startsWith: "http" } },
  });
  for (const channel of channels) {
    try {
      const response = await fetch(channel.avatarUrl!);
      if (!response.ok) throw new Error(`Avatar HTTP ${response.status}`);
      const digest = createHash("sha256").update(channel.avatarUrl!).digest("hex").slice(0, 16);
      const key = `channels/${channel.id}/avatar-${digest}.${extension(
        channel.avatarUrl!,
        response.headers.get("content-type"),
      )}`;
      const destination = path.join(stagingRoot, ...key.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, Buffer.from(await response.arrayBuffer()));
      await prisma.channel.update({ where: { id: channel.id }, data: { avatarUrl: key } });
      console.log(`repaired channel avatar ${channel.id} -> ${key}`);
    } catch (error) {
      console.warn(
        `failed channel avatar ${channel.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const messages = await prisma.message.findMany({
    where: { media: { contains: "http" } },
    include: { channel: true },
    orderBy: { createdAt: "asc" },
  });
  let repaired = 0;
  let failed = 0;

  for (const message of messages) {
    try {
      const telegramId = message.telegramMessageId ?? message.id.match(/(\d+)$/)?.[1];
      if (!telegramId || !message.channel.username) throw new Error("Missing Telegram identity");
      const embedUrl = `https://t.me/${message.channel.username}/${telegramId}?embed=1&mode=tme`;
      const embed = await fetch(embedUrl);
      if (!embed.ok) throw new Error(`Embed HTTP ${embed.status}`);
      const $ = load(await embed.text());
      const photo = $(".tgme_widget_message_photo_wrap").first();
      const sourceUrl =
        backgroundUrl(photo.attr("style")) ??
        backgroundUrl(photo.find(".tgme_widget_message_photo").attr("style")) ??
        $("video").first().attr("src") ??
        $("video source").first().attr("src");
      if (!sourceUrl) throw new Error("No real media URL in embed page");
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error(`Media HTTP ${response.status}`);
      const digest = createHash("sha256").update(sourceUrl).digest("hex").slice(0, 16);
      const kind = $("video").length ? "video" : "photo";
      const key = `channels/${message.channelId}/${telegramId}/embed-${digest}.${extension(
        sourceUrl,
        response.headers.get("content-type"),
      )}`;
      const destination = path.join(stagingRoot, ...key.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, Buffer.from(await response.arrayBuffer()));
      const previous = JSON.parse(message.media ?? "{}") as Record<string, unknown>;
      await prisma.message.update({
        where: { id: message.id },
        data: {
          media: JSON.stringify({
            ...previous,
            type: kind,
            url: key,
            thumb: undefined,
          }),
        },
      });
      repaired += 1;
      console.log(`repaired ${message.id} -> ${key}`);
    } catch (error) {
      failed += 1;
      console.warn(
        `failed ${message.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  console.log(`Repair complete: ${repaired} repaired, ${failed} failed.`);
}

repair()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
