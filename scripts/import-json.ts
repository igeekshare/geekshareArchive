import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";

type MediaType = "photo" | "video" | "file";

type SourceMedia = {
  type: MediaType;
  url: string;
  thumb?: string;
  width?: string;
  height?: string;
  title?: string;
  description?: string;
};

type SourceReaction = {
  emoji: string;
  count: string;
};

type SourceMessage = {
  id: string;
  date: string;
  from: string;
  text: string;
  media: SourceMedia | null;
  replyTo: string | null;
  reactions: SourceReaction[] | null;
};

const prisma = new PrismaClient();

const DEFAULT_CHANNEL = {
  id: "geekshare",
  slug: "geekshare",
  title: "极客分享",
  username: "xgeekshare",
  telegramUrl: "https://t.me/xgeekshare",
  archiveUrl: "https://archive.geekshare.org",
  description: "GeekShare Telegram channel archive",
};

const DEFAULT_CHANNEL_DATA = {
  slug: DEFAULT_CHANNEL.slug,
  title: DEFAULT_CHANNEL.title,
  username: DEFAULT_CHANNEL.username,
  telegramUrl: DEFAULT_CHANNEL.telegramUrl,
  archiveUrl: DEFAULT_CHANNEL.archiveUrl,
  description: DEFAULT_CHANNEL.description,
};

const JSON_PATH = path.join(process.cwd(), "src", "data", "messages.json");
const BATCH_SIZE = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  value: unknown,
  fieldName: string,
  index: number,
): string {
  if (typeof value !== "string") {
    throw new Error(`Message at index ${index} has invalid ${fieldName}`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseMedia(value: unknown, index: number): SourceMedia | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    throw new Error(`Message at index ${index} has invalid media`);
  }

  const type = value.type;
  if (type !== "photo" && type !== "video" && type !== "file") {
    throw new Error(`Message at index ${index} has unsupported media.type`);
  }

  const media: SourceMedia = {
    type,
    url: requireString(value.url, "media.url", index),
  };

  const thumb = optionalString(value.thumb);
  const width = optionalString(value.width);
  const height = optionalString(value.height);
  const title = optionalString(value.title);
  const description = optionalString(value.description);

  if (thumb !== undefined) media.thumb = thumb;
  if (width !== undefined) media.width = width;
  if (height !== undefined) media.height = height;
  if (title !== undefined) media.title = title;
  if (description !== undefined) media.description = description;

  return media;
}

function parseReactions(value: unknown, index: number): SourceReaction[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw new Error(`Message at index ${index} has invalid reactions`);
  }

  return value.map((reaction, reactionIndex) => {
    if (!isRecord(reaction)) {
      throw new Error(
        `Message at index ${index} has invalid reaction ${reactionIndex}`,
      );
    }

    return {
      emoji: requireString(reaction.emoji, "reaction.emoji", index),
      count: requireString(reaction.count, "reaction.count", index),
    };
  });
}

function parseMessage(value: unknown, index: number): SourceMessage {
  if (!isRecord(value)) {
    throw new Error(`Message at index ${index} is not an object`);
  }

  return {
    id: requireString(value.id, "id", index),
    date: requireString(value.date, "date", index),
    from: requireString(value.from, "from", index),
    text: requireString(value.text, "text", index),
    media: parseMedia(value.media, index),
    replyTo: nullableString(value.replyTo),
    reactions: parseReactions(value.reactions, index),
  };
}

function serializeJson(
  value: SourceMedia | SourceReaction[] | null,
): string | null {
  return value === null ? null : JSON.stringify(value);
}

async function loadMessages(): Promise<SourceMessage[]> {
  const raw = await readFile(JSON_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("messages.json must contain an array");
  }

  return parsed.map(parseMessage);
}

async function importMessages(messages: SourceMessage[]): Promise<number> {
  const channel = await prisma.channel.upsert({
    where: { id: DEFAULT_CHANNEL.id },
    update: DEFAULT_CHANNEL_DATA,
    create: DEFAULT_CHANNEL,
  });

  const syncLog = await prisma.syncLog.create({
    data: {
      channelId: channel.id,
      source: path.relative(process.cwd(), JSON_PATH).replace(/\\/g, "/"),
      status: "running",
      importedCount: 0,
    },
  });

  let importedCount = 0;

  try {
    for (let start = 0; start < messages.length; start += BATCH_SIZE) {
      const batch = messages.slice(start, start + BATCH_SIZE);

      await prisma.$transaction(
        batch.map((message) => {
          const data = {
            channelId: channel.id,
            date: message.date,
            from: message.from,
            text: message.text,
            media: serializeJson(message.media),
            replyTo: message.replyTo,
            reactions: serializeJson(message.reactions),
          };

          return prisma.message.upsert({
            where: { id: message.id },
            update: data,
            create: {
              id: message.id,
              ...data,
            },
          });
        }),
      );

      importedCount += batch.length;
    }

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "success",
        importedCount,
        finishedAt: new Date(),
      },
    });

    return importedCount;
  } catch (error) {
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
        importedCount,
        finishedAt: new Date(),
      },
    });

    throw error;
  }
}

async function main() {
  const messages = await loadMessages();
  const importedCount = await importMessages(messages);

  console.log(`Imported ${importedCount} messages into Prisma database.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
