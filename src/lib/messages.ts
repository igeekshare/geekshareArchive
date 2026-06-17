import messagesData from "@/data/messages.json";
import { prisma } from "@/lib/prisma";

export type PublicReaction = {
  emoji: string;
  count: string;
};

export type PublicMedia = {
  type: "photo" | "video" | "file";
  url: string;
  thumb?: string;
  width?: string;
  height?: string;
  title?: string;
  description?: string;
};

export type PublicMessage = {
  id: string;
  date: string;
  from: string;
  text: string;
  media?: PublicMedia | null;
  replyTo?: string | null;
  reactions?: PublicReaction[] | null;
};

export type ArchiveMonths = {
  years: string[];
  monthsByYear: Record<string, string[]>;
};

type JsonMessage = {
  id: string;
  date: string;
  from: string;
  text: string;
  media?: PublicMedia | null;
  replyTo?: string | null;
  reactions?: PublicReaction[] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonField<T>(value: string | null, guard: (input: unknown) => T | null): T | null {
  if (!value) return null;

  try {
    return guard(JSON.parse(value));
  } catch {
    return null;
  }
}

function asMedia(value: unknown): PublicMedia | null {
  if (!isRecord(value)) return null;
  if (value.type !== "photo" && value.type !== "video" && value.type !== "file") return null;
  if (typeof value.url !== "string") return null;

  const media: PublicMedia = {
    type: value.type,
    url: value.url,
  };

  if (typeof value.thumb === "string") media.thumb = value.thumb;
  if (typeof value.width === "string") media.width = value.width;
  if (typeof value.height === "string") media.height = value.height;
  if (typeof value.title === "string") media.title = value.title;
  if (typeof value.description === "string") media.description = value.description;

  return media;
}

function asReactions(value: unknown): PublicReaction[] | null {
  if (!Array.isArray(value)) return null;

  const reactions = value.flatMap((reaction) => {
    if (!isRecord(reaction)) return [];
    if (typeof reaction.emoji !== "string" || typeof reaction.count !== "string") return [];

    return [{ emoji: reaction.emoji, count: reaction.count }];
  });

  return reactions.length > 0 ? reactions : null;
}

function normalizeFallbackMessage(message: JsonMessage): PublicMessage {
  return {
    id: message.id,
    date: message.date,
    from: message.from,
    text: message.text,
    media: message.media ?? null,
    replyTo: message.replyTo ?? null,
    reactions: message.reactions ?? null,
  };
}

function getFallbackMessages(): PublicMessage[] {
  return [...(messagesData as JsonMessage[])]
    .map(normalizeFallbackMessage)
    .reverse();
}

function getMessageNumber(id: string): number {
  const numericId = Number(id.replace(/^message/, ""));
  return Number.isFinite(numericId) ? numericId : 0;
}

function sortNewestFirst(messages: PublicMessage[]): PublicMessage[] {
  return [...messages].sort((a, b) => getMessageNumber(b.id) - getMessageNumber(a.id));
}

let publicMessagesPromise: Promise<PublicMessage[]> | null = null;

async function loadPublicMessages(): Promise<PublicMessage[]> {
  try {
    const rows = await prisma.message.findMany({
      where: {
        OR: [{ status: null }, { status: "published" }],
      },
      select: {
        id: true,
        date: true,
        from: true,
        text: true,
        media: true,
        replyTo: true,
        reactions: true,
      },
    });

    if (rows.length === 0) {
      return getFallbackMessages();
    }

    return sortNewestFirst(
      rows.map((message) => ({
        id: message.id,
        date: message.date,
        from: message.from,
        text: message.text,
        media: parseJsonField(message.media, asMedia),
        replyTo: message.replyTo,
        reactions: parseJsonField(message.reactions, asReactions),
      })),
    );
  } catch {
    return getFallbackMessages();
  }
}

export async function getPublicMessages(): Promise<PublicMessage[]> {
  publicMessagesPromise ??= loadPublicMessages();
  return publicMessagesPromise;
}

export async function getMessageById(id: string): Promise<PublicMessage | null> {
  const messages = await getPublicMessages();
  return messages.find((message) => message.id === id) ?? null;
}

export async function getAvailableTags(): Promise<string[]> {
  const tagCountMap: Record<string, number> = {};
  const messages = await getPublicMessages();

  messages.forEach((message) => {
    if (!message.text) return;

    const regex = /#([A-Za-z0-9_\u4e00-\u9fa5]+)/g;
    let match;
    while ((match = regex.exec(message.text)) !== null) {
      const tag = match[1].trim();
      if (tag) tagCountMap[tag] = (tagCountMap[tag] || 0) + 1;
    }
  });

  return Object.entries(tagCountMap)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
}

export async function getArchiveMonths(): Promise<ArchiveMonths> {
  const messages = await getPublicMessages();
  const years = new Set<string>();
  const monthsByYear: Record<string, Set<string>> = {};

  messages.forEach((message) => {
    const datePart = message.date.split(" ")[0];
    const parts = datePart.split(".");
    const month = parts[1];
    const year = parts[2];

    if (!year || !month) return;
    years.add(year);
    if (!monthsByYear[year]) monthsByYear[year] = new Set();
    monthsByYear[year].add(month);
  });

  return {
    years: Array.from(years).sort((a, b) => b.localeCompare(a)),
    monthsByYear: Object.fromEntries(
      Object.entries(monthsByYear).map(([year, months]) => [
        year,
        Array.from(months).sort(),
      ]),
    ),
  };
}
