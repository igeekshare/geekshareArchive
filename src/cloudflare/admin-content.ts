import type { StoredMedia } from "./models";
import { shanghaiDate, telegramTextToHtml } from "./telegram";

export const ADMIN_MESSAGE_STATUSES = ["published", "hidden"] as const;
export const ADMIN_MEDIA_STATUSES = [
  "none",
  "archived",
  "external",
  "pending",
  "failed",
] as const;
export const ADMIN_MESSAGE_SORTS = ["newest", "oldest", "updated"] as const;
export const ADMIN_BULK_ACTIONS = ["publish", "hide", "delete", "retry-media"] as const;

export type AdminMessageStatus = (typeof ADMIN_MESSAGE_STATUSES)[number];
export type AdminMediaStatus = (typeof ADMIN_MEDIA_STATUSES)[number];
export type AdminMessageSort = (typeof ADMIN_MESSAGE_SORTS)[number];
export type AdminBulkAction = (typeof ADMIN_BULK_ACTIONS)[number];

export function parseAdminMessageStatus(value: string | null): AdminMessageStatus | "all" | null {
  const normalized = value ?? "all";
  return normalized === "all" || ADMIN_MESSAGE_STATUSES.includes(normalized as AdminMessageStatus)
    ? (normalized as AdminMessageStatus | "all")
    : null;
}

export function parseAdminMediaStatus(value: string | null): AdminMediaStatus | "all" | null {
  const normalized = value ?? "all";
  return normalized === "all" || ADMIN_MEDIA_STATUSES.includes(normalized as AdminMediaStatus)
    ? (normalized as AdminMediaStatus | "all")
    : null;
}

export function parseAdminMessageSort(value: string | null): AdminMessageSort | null {
  const normalized = value ?? "newest";
  return ADMIN_MESSAGE_SORTS.includes(normalized as AdminMessageSort)
    ? (normalized as AdminMessageSort)
    : null;
}

export function normalizeAdminTags(value: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return { ok: false, error: "标签必须是字符串数组" };
  if (value.length > 30) return { ok: false, error: "每条消息最多保存 30 个标签" };
  const tags = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return { ok: false, error: "标签必须是字符串数组" };
    const tag = item.trim().replace(/^#+/, "").toLocaleLowerCase();
    if (!tag || [...tag].length > 64 || !/^[\p{L}\p{N}_-]+$/u.test(tag)) {
      return { ok: false, error: `标签“${item}”格式无效` };
    }
    tags.add(tag);
  }
  return { ok: true, value: [...tags] };
}

export function plainTextToSafeHtml(value: string): string {
  return telegramTextToHtml(value, []);
}

export function parseAdminPublishedAt(value: unknown):
  | { ok: true; epochSeconds: number; date: ReturnType<typeof shanghaiDate> }
  | { ok: false; error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "发布时间必须是有效日期" };
  }
  const trimmed = value.trim();
  const candidate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(trimmed)
    ? `${trimmed}+08:00`
    : trimmed;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return { ok: false, error: "发布时间必须是有效日期" };
  const epochSeconds = Math.floor(parsed.getTime() / 1000);
  return { ok: true, epochSeconds, date: shanghaiDate(epochSeconds) };
}

export function knownMediaKeys(value: StoredMedia[]): string[] {
  const keys = new Set<string>();
  for (const item of value) {
    if (item.r2Key && !/^https?:\/\//i.test(item.r2Key)) keys.add(item.r2Key.replace(/^\//, ""));
    if (item.thumbKey && !/^https?:\/\//i.test(item.thumbKey)) keys.add(item.thumbKey.replace(/^\//, ""));
  }
  return [...keys];
}

export function isAdminBulkAction(value: unknown): value is AdminBulkAction {
  return typeof value === "string" && ADMIN_BULK_ACTIONS.includes(value as AdminBulkAction);
}
