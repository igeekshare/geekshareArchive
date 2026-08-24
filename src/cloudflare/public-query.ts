import type { MessageCategory, MessageSort } from "../lib/messages";

export const MESSAGE_CATEGORIES: MessageCategory[] = ["all", "visual", "link", "interactive", "file"];
export const MESSAGE_SORTS: MessageSort[] = ["newest", "oldest", "featured", "hot"];

export type MessageCursor = {
  publishedAt: number;
  id: string;
  featuredOrder: number;
  engagementScore: number;
};

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(`${normalized}${padding}`);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function encodeMessageCursor(cursor: MessageCursor): string {
  return base64UrlEncode(JSON.stringify(cursor));
}

export function parseMessageCursor(value: string | null): MessageCursor | null | undefined {
  if (!value) return null;
  if (value.length > 512) return undefined;
  try {
    const parsed = JSON.parse(base64UrlDecode(value)) as Partial<MessageCursor>;
    if (
      !Number.isInteger(parsed.publishedAt)
      || typeof parsed.id !== "string"
      || !parsed.id
      || parsed.id.length > 160
      || !Number.isInteger(parsed.featuredOrder)
      || !Number.isInteger(parsed.engagementScore)
    ) return undefined;
    return parsed as MessageCursor;
  } catch {
    return undefined;
  }
}

export function parseMessageCategory(value: string | null): MessageCategory | null {
  const normalized = value ?? "all";
  return MESSAGE_CATEGORIES.includes(normalized as MessageCategory)
    ? (normalized as MessageCategory)
    : null;
}

export function parseMessageSort(value: string | null): MessageSort | null {
  const normalized = value ?? "newest";
  return MESSAGE_SORTS.includes(normalized as MessageSort) ? (normalized as MessageSort) : null;
}

export function parseChannelFilter(value: string | null): string | null | undefined {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  return /^[a-z0-9_-]{2,64}$/.test(normalized) ? normalized : undefined;
}

export function messageCategoryClause(category: MessageCategory): string {
  switch (category) {
    case "visual":
      return " AND json_extract(m.media, '$[0].type') IN ('photo', 'video')";
    case "link":
      return " AND (json_extract(m.media, '$[0].type') = 'link' OR instr(lower(m.html), '<a ') > 0)";
    case "interactive":
      return " AND (m.reply_to IS NOT NULL OR json_array_length(m.reactions) > 0)";
    case "file":
      return " AND json_extract(m.media, '$[0].type') = 'file'";
    default:
      return "";
  }
}

export function calculateSyncSuccessRate(success: unknown, failed: unknown): number | null {
  const succeeded = Math.max(0, Number(success) || 0);
  const failures = Math.max(0, Number(failed) || 0);
  const total = succeeded + failures;
  return total ? Math.round((succeeded / total) * 100) : null;
}

export function choosePrimaryChannel<T extends { message_count?: number }>(channels: T[]): T | null {
  return channels.reduce<T | null>((best, channel) => {
    if (!best) return channel;
    return Number(channel.message_count ?? 0) > Number(best.message_count ?? 0) ? channel : best;
  }, null);
}
