import {
  MESSAGE_SELECT,
  messageRowToPublic,
  type MessageRow,
  type StoredMedia,
} from "./models";
import {
  isAdminBulkAction,
  knownMediaKeys,
  normalizeAdminTags,
  parseAdminMediaStatus,
  parseAdminMessageSort,
  parseAdminMessageStatus,
  parseAdminPublishedAt,
  plainTextToSafeHtml,
  type AdminBulkAction,
  type AdminMessageStatus,
} from "./admin-content";
import {
  absoluteMediaUrl,
  authenticateAdminRequest,
  errorResponse,
  isSafeMutation,
  json,
  parseInteger,
  safeJsonParse,
  type Env,
  type ExecutionContextLike,
} from "./runtime";
import {
  encodeMessageCursor,
  messageCategoryClause,
  parseChannelFilter,
  parseMessageCategory,
  parseMessageCursor,
  parseMessageSort,
  type MessageCursor,
} from "./public-query";
import type { HomepageData, MessageDiscoveryContext, MessageSort } from "../lib/messages";
import {
  DEFAULT_BRANDING_SETTINGS,
  DEFAULT_PUBLIC_SITE_CONFIG,
  DEFAULT_SEO_SETTINGS,
  SITE_ASSET_LIMITS,
  SITE_BRANDING_SETTING_KEY,
  SITE_SEO_SETTING_KEY,
  assetUrl,
  detectSiteAsset,
  normalizeStoredBranding,
  normalizeStoredSeo,
  validateBrandingPatch,
  validateSeoPatch,
  type PublicSiteConfig,
  type SiteAssetType,
  type StoredBrandingSettings,
  type StoredSeoSettings,
} from "../lib/site-config";
import {
  archiveMedia,
  archiveBotFile,
  extractTags,
  MediaArchiveError,
  messageMedia,
  secretsMatch,
  shanghaiDate,
  stableMessageId,
  telegramApi,
  telegramTextToHtml,
  type TelegramMessage,
  type TelegramReactionUpdate,
  type TelegramUpdate,
} from "./telegram";

const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 60;
export const WEBHOOK_PROCESSING_LEASE_MS = 10 * 60 * 1000;
export const MEDIA_MAX_RETRY_ATTEMPTS = 5;
export const MEDIA_RETRY_DELAYS_MS = [
  60 * 60 * 1000,
  2 * 60 * 60 * 1000,
  4 * 60 * 60 * 1000,
  8 * 60 * 60 * 1000,
] as const;

export function mediaRetryDelayMs(failureCount: number): number | null {
  return MEDIA_RETRY_DELAYS_MS[failureCount - 1] ?? null;
}

interface ChannelRow {
  id: string;
  slug: string;
  title: string;
  username: string;
  telegram_chat_id: string | null;
  telegram_url: string;
  archive_url: string;
  description: string | null;
  avatar_key: string | null;
  enabled: number;
  last_synced_at: string | null;
  last_webhook_at: string | null;
  last_synced_message_id: number | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
  source_message_count?: number;
  last_error?: string | null;
}

interface AdminMessageRow extends MessageRow {
  origin_channel_id: string;
  status: string;
  admin_override: number;
  admin_updated_at: string | null;
  admin_updated_by: string | null;
  updated_at: string;
  tags: string;
  origin_channel_title: string;
  origin_channel_username: string;
}

interface TombstoneRow {
  message_id: string;
  media_keys: string;
  cleanup_status: "pending" | "complete" | "failed";
}

interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

interface TelegramBotIdentity {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TelegramWebhookInfo {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  allowed_updates?: string[];
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function searchClause(query: string, values: unknown[]): string {
  if (!query) return "";
  const like = `%${escapeLike(query)}%`;
  values.push(like);
  if ([...query].length < 3) {
    values.push(like);
    return " AND (m.id LIKE ? ESCAPE '\\' OR m.plain_text LIKE ? ESCAPE '\\')";
  }
  values.push(`"${query.replaceAll('"', '""')}"`);
  return " AND (m.id LIKE ? ESCAPE '\\' OR m.id IN (SELECT id FROM messages_fts WHERE messages_fts MATCH ?))";
}

function messageOrder(sort: MessageSort): string {
  if (sort === "oldest") return "m.published_at ASC, m.id ASC";
  if (sort === "featured") return "m.featured_order ASC, m.published_at DESC, m.id DESC";
  if (sort === "hot") return "m.engagement_score DESC, m.published_at DESC, m.id DESC";
  return "m.published_at DESC, m.id DESC";
}

function cursorClause(sort: MessageSort, cursor: MessageCursor, values: unknown[]): string {
  if (sort === "oldest") {
    values.push(cursor.publishedAt, cursor.publishedAt, cursor.id);
    return " AND (m.published_at > ? OR (m.published_at = ? AND m.id > ?))";
  }
  if (sort === "featured") {
    values.push(
      cursor.featuredOrder,
      cursor.featuredOrder,
      cursor.publishedAt,
      cursor.publishedAt,
      cursor.id,
    );
    return ` AND (
      m.featured_order > ? OR
      (m.featured_order = ? AND (
        m.published_at < ? OR (m.published_at = ? AND m.id < ?)
      ))
    )`;
  }
  if (sort === "hot") {
    values.push(
      cursor.engagementScore,
      cursor.engagementScore,
      cursor.publishedAt,
      cursor.publishedAt,
      cursor.id,
    );
    return ` AND (
      m.engagement_score < ? OR
      (m.engagement_score = ? AND (
        m.published_at < ? OR (m.published_at = ? AND m.id < ?)
      ))
    )`;
  }
  values.push(cursor.publishedAt, cursor.publishedAt, cursor.id);
  return " AND (m.published_at < ? OR (m.published_at = ? AND m.id < ?))";
}

function cursorForRow(row: MessageRow): MessageCursor {
  return {
    publishedAt: Number(row.published_at),
    id: row.id,
    featuredOrder: Number(row.featured_order ?? 0),
    engagementScore: Number(row.engagement_score ?? 0),
  };
}

const ADMIN_MESSAGE_SELECT = `
  SELECT m.id, m.channel_id, m.telegram_message_id, m.source_url,
         m.date, m.datetime, m.published_at, m.published_year,
         m.published_month, m.sender, m.html, m.plain_text, m.media,
         m.reply_to, m.reactions, m.media_archive_status,
         m.display_title, m.display_summary, m.is_featured,
         m.featured_order, m.engagement_score,
         c.title AS channel_title, c.username AS channel_username,
         c.avatar_key AS channel_avatar_key,
         COALESCE(m.origin_channel_id, m.channel_id) AS origin_channel_id,
         m.status, m.admin_override, m.admin_updated_at, m.admin_updated_by,
         m.updated_at,
         oc.title AS origin_channel_title, oc.username AS origin_channel_username,
         COALESCE((SELECT json_group_array(mt.tag)
                   FROM message_tags mt WHERE mt.message_id = m.id), '[]') AS tags
  FROM messages m
  JOIN channels c ON c.id = m.channel_id
  JOIN channels oc ON oc.id = COALESCE(m.origin_channel_id, m.channel_id)`;

function adminMessageJson(row: AdminMessageRow, env: Env): Record<string, unknown> {
  return {
    ...messageRowToPublic(row, env.MEDIA_BASE_URL, { content: "raw" }),
    displayTitle: row.display_title,
    displaySummary: row.display_summary,
    originChannelId: row.origin_channel_id,
    originChannel: {
      title: row.origin_channel_title,
      username: row.origin_channel_username,
    },
    tags: safeJsonParse<string[]>(row.tags, []),
    status: row.status,
    adminOverride: Boolean(row.admin_override),
    adminUpdatedAt: row.admin_updated_at,
    adminUpdatedBy: row.admin_updated_by,
    updatedAt: row.updated_at,
  };
}

async function loadStoredSiteSettings(env: Env): Promise<{
  branding: StoredBrandingSettings;
  seo: StoredSeoSettings;
  updatedAt: string | null;
}> {
  const rows = await env.DB.prepare(
    "SELECT key, value, updated_at FROM site_settings WHERE key IN (?, ?)",
  )
    .bind(SITE_BRANDING_SETTING_KEY, SITE_SEO_SETTING_KEY)
    .all<SettingRow>();
  const byKey = new Map((rows.results ?? []).map((row) => [row.key, row]));
  const brandingRow = byKey.get(SITE_BRANDING_SETTING_KEY);
  const seoRow = byKey.get(SITE_SEO_SETTING_KEY);
  const timestamps = [brandingRow?.updated_at, seoRow?.updated_at].filter(
    (value): value is string => Boolean(value),
  );
  return {
    branding: normalizeStoredBranding(
      safeJsonParse(brandingRow?.value, DEFAULT_BRANDING_SETTINGS),
    ),
    seo: normalizeStoredSeo(safeJsonParse(seoRow?.value, DEFAULT_SEO_SETTINGS)),
    updatedAt: timestamps.sort().at(-1) ?? null,
  };
}

export async function loadSiteConfig(env: Env): Promise<PublicSiteConfig> {
  let stored: Awaited<ReturnType<typeof loadStoredSiteSettings>>;
  try {
    stored = await loadStoredSiteSettings(env);
  } catch {
    return DEFAULT_PUBLIC_SITE_CONFIG;
  }
  return {
    branding: {
      siteName: stored.branding.siteName,
      homepageTitle: stored.branding.homepageTitle,
      description: stored.branding.description,
      logoUrl: absoluteMediaUrl(env.MEDIA_BASE_URL, stored.branding.logoKey ?? undefined) ?? null,
      faviconUrl: assetUrl(env.MEDIA_BASE_URL, stored.branding.faviconKey, "/favicon.svg"),
    },
    seo: {
      title: stored.seo.title,
      description: stored.seo.description,
      keywords: stored.seo.keywords,
      canonicalUrl: stored.seo.canonicalUrl,
      ogImageUrl: assetUrl(env.MEDIA_BASE_URL, stored.seo.ogImageKey, "/og-image.svg"),
      robotsIndex: stored.seo.robotsIndex,
      robotsFollow: stored.seo.robotsFollow,
    },
    updatedAt: stored.updatedAt,
  };
}

async function getMessages(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const page = parseInteger(url.searchParams.get("page"), 1, 1, 100_000);
  const limit = parseInteger(url.searchParams.get("limit"), PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const tag = (url.searchParams.get("tag") ?? "").trim().slice(0, 64);
  const year = (url.searchParams.get("year") ?? "").trim();
  const month = (url.searchParams.get("month") ?? "").trim();
  const channelId = parseChannelFilter(url.searchParams.get("channel"));
  const category = parseMessageCategory(url.searchParams.get("category"));
  const sort = parseMessageSort(url.searchParams.get("sort"));
  const cursor = parseMessageCursor(url.searchParams.get("cursor"));
  const requestedIds = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (year && !/^\d{4}$/.test(year)) return errorResponse(400, "Invalid year");
  if (month && !/^(?:\d{4}-)?\d{2}$/.test(month)) return errorResponse(400, "Invalid month");
  if (channelId === undefined) return errorResponse(400, "Invalid channel");
  if (!category) return errorResponse(400, "Invalid category");
  if (!sort) return errorResponse(400, "Invalid sort");
  if (cursor === undefined) return errorResponse(400, "Invalid cursor");
  if (requestedIds.length > 50 || requestedIds.some((id) => id.length > 160)) {
    return errorResponse(400, "Invalid message ids");
  }

  const values: unknown[] = [];
  let where = " WHERE m.status = 'published'";
  if (requestedIds.length) {
    where += ` AND m.id IN (${requestedIds.map(() => "?").join(", ")})`;
    values.push(...requestedIds);
  }
  if (channelId) {
    where += " AND m.channel_id = ?";
    values.push(channelId);
  }
  where += searchClause(query, values);
  if (tag) {
    where += " AND EXISTS (SELECT 1 FROM message_tags mt WHERE mt.message_id = m.id AND mt.tag = ?)";
    values.push(tag.toLocaleLowerCase());
  }
  if (year) {
    where += " AND m.published_year = ?";
    values.push(year);
  }
  if (month) {
    where += month.length === 2
      ? " AND substr(m.published_month, 6, 2) = ?"
      : " AND m.published_month = ?";
    values.push(month);
  }
  where += messageCategoryClause(category);
  if (sort === "featured") where += " AND m.is_featured = 1";
  if (sort === "hot") where += " AND m.published_at >= CAST(strftime('%s', 'now', '-7 days') AS INTEGER)";

  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM messages m${where}`)
    .bind(...values)
    .first<{ count: number }>();
  const total = Number(count?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const listValues = [...values];
  const listWhere = cursor ? `${where}${cursorClause(sort, cursor, listValues)}` : where;
  const rows = await env.DB.prepare(
    `${MESSAGE_SELECT}${listWhere} ORDER BY ${messageOrder(sort)} LIMIT ? OFFSET ?`,
  )
    .bind(...listValues, limit + 1, cursor ? 0 : (safePage - 1) * limit)
    .all<MessageRow>();
  const candidates = rows.results ?? [];
  const hasMore = candidates.length > limit;
  const pageRows = candidates.slice(0, limit);

  return json(
    {
      items: pageRows.map((row) => messageRowToPublic(row, env.MEDIA_BASE_URL)),
      page: safePage,
      total,
      totalPages,
      nextCursor: hasMore && pageRows.length
        ? encodeMessageCursor(cursorForRow(pageRows.at(-1)!))
        : null,
    },
  );
}

async function getHomepage(env: Env): Promise<Response> {
  const channelRows = await env.DB.prepare(
    `SELECT c.*, COUNT(m.id) AS message_count
     FROM channels c
     LEFT JOIN messages m ON m.channel_id = c.id AND m.status = 'published'
     GROUP BY c.id
     HAVING c.enabled = 1 OR COUNT(m.id) > 0
     ORDER BY c.created_at ASC`,
  ).all<ChannelRow>();
  const channels = channelRows.results ?? [];
  const [messageCount, tagCount, hotTopics, featured, trending, fallbackFeatured, recentMedia] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(*) AS count FROM messages WHERE status = 'published'",
    ).first<{ count: number }>(),
    env.DB.prepare(
      `SELECT COUNT(DISTINCT mt.tag) AS count
       FROM message_tags mt JOIN messages m ON m.id = mt.message_id
       WHERE m.status = 'published'`,
    ).first<{ count: number }>(),
    env.DB.prepare(
      `SELECT mt.tag, COUNT(*) AS count
       FROM message_tags mt JOIN messages m ON m.id = mt.message_id
       WHERE m.status = 'published'
       GROUP BY mt.tag ORDER BY count DESC, mt.tag ASC LIMIT 8`,
    ).all<{ tag: string; count: number }>(),
    env.DB.prepare(
      `${MESSAGE_SELECT} WHERE m.status = 'published' AND m.is_featured = 1
       ORDER BY m.featured_order ASC, m.published_at DESC, m.id DESC LIMIT 3`,
    ).all<MessageRow>(),
    env.DB.prepare(
      `${MESSAGE_SELECT} WHERE m.status = 'published' AND m.is_featured = 0
       AND m.published_at >= CAST(strftime('%s', 'now', '-7 days') AS INTEGER)
       ORDER BY m.engagement_score DESC, m.published_at DESC, m.id DESC LIMIT 4`,
    ).all<MessageRow>(),
    env.DB.prepare(
      `${MESSAGE_SELECT} WHERE m.status = 'published'
       ORDER BY m.engagement_score DESC, m.published_at DESC, m.id DESC LIMIT 1`,
    ).first<MessageRow>(),
    env.DB.prepare(
      `${MESSAGE_SELECT} WHERE m.status = 'published'
       AND json_array_length(m.media) > 0
       ORDER BY m.published_at DESC, m.id DESC LIMIT 5`,
    ).all<MessageRow>(),
  ]);
  const featuredRows = featured.results?.length
    ? featured.results
    : fallbackFeatured
      ? [fallbackFeatured]
      : [];

  const response: HomepageData = {
    channels: channels.map((channel) => ({
      id: channel.id,
      title: channel.title,
      username: channel.username,
      description: channel.description,
      avatarUrl: absoluteMediaUrl(env.MEDIA_BASE_URL, channel.avatar_key ?? undefined),
      telegramUrl: channel.telegram_url,
      createdAt: channel.created_at,
      messageCount: Number(channel.message_count ?? 0),
      enabled: Boolean(channel.enabled),
    })),
    stats: {
      messageCount: Number(messageCount?.count ?? 0),
      tagCount: Number(tagCount?.count ?? 0),
      channelCount: channels.length,
    },
    featuredMessages: featuredRows.map((row) => messageRowToPublic(row, env.MEDIA_BASE_URL)),
    trendingMessages: (trending.results ?? []).map((row) => messageRowToPublic(row, env.MEDIA_BASE_URL)),
    hotTopics: hotTopics.results ?? [],
    recentMedia: (recentMedia.results ?? []).map((row) => messageRowToPublic(row, env.MEDIA_BASE_URL)),
  };
  return json(response);
}

async function getArchiveMeta(env: Env): Promise<Response> {
  const [tags, dates] = await Promise.all([
    env.DB.prepare(
      `SELECT tag, COUNT(*) AS count
       FROM message_tags mt JOIN messages m ON m.id = mt.message_id
       WHERE m.status = 'published'
       GROUP BY tag HAVING COUNT(*) >= 2
       ORDER BY count DESC, tag ASC`,
    ).all<{ tag: string; count: number }>(),
    env.DB.prepare(
      `SELECT published_year AS year, published_month AS month, COUNT(*) AS count
       FROM messages WHERE status = 'published'
       GROUP BY published_year, published_month
       ORDER BY published_year DESC, published_month DESC`,
    ).all<{ year: string; month: string; count: number }>(),
  ]);
  const monthsByYear: Record<string, string[]> = {};
  for (const row of dates.results ?? []) {
    monthsByYear[row.year] ??= [];
    monthsByYear[row.year].push(row.month);
  }
  return json(
    {
      tags: tags.results ?? [],
      years: Object.keys(monthsByYear).sort().reverse(),
      monthsByYear,
    },
  );
}

export async function findMessage(id: string, env: Env): Promise<ReturnType<typeof messageRowToPublic> | null> {
  const row = await env.DB.prepare(`${MESSAGE_SELECT} WHERE m.id = ? AND m.status = 'published'`)
    .bind(id)
    .first<MessageRow>();
  return row ? messageRowToPublic(row, env.MEDIA_BASE_URL) : null;
}

async function getMessage(id: string, env: Env): Promise<Response> {
  const message = await findMessage(id, env);
  return message ? json(message) : errorResponse(404, "Message not found");
}

async function getMessageDiscoveryContext(id: string, env: Env): Promise<Response> {
  const target = await env.DB.prepare(
    `${MESSAGE_SELECT} WHERE m.id = ? AND m.status = 'published'`,
  )
    .bind(id)
    .first<MessageRow>();
  if (!target) return errorResponse(404, "Message not found");

  const [previous, next, related] = await Promise.all([
    env.DB.prepare(
      `${MESSAGE_SELECT} WHERE m.status = 'published' AND
       (m.published_at < ? OR (m.published_at = ? AND m.id < ?))
       ORDER BY m.published_at DESC, m.id DESC LIMIT 1`,
    ).bind(target.published_at, target.published_at, target.id).first<MessageRow>(),
    env.DB.prepare(
      `${MESSAGE_SELECT} WHERE m.status = 'published' AND
       (m.published_at > ? OR (m.published_at = ? AND m.id > ?))
       ORDER BY m.published_at ASC, m.id ASC LIMIT 1`,
    ).bind(target.published_at, target.published_at, target.id).first<MessageRow>(),
    env.DB.prepare(
      `${MESSAGE_SELECT} WHERE m.status = 'published' AND m.id <> ? AND (
         m.channel_id = ? OR EXISTS (
           SELECT 1 FROM message_tags candidate_tag
           WHERE candidate_tag.message_id = m.id AND candidate_tag.tag IN (
             SELECT tag FROM message_tags WHERE message_id = ?
           )
         )
       )
       ORDER BY
         (SELECT COUNT(*) FROM message_tags candidate_tag
          WHERE candidate_tag.message_id = m.id AND candidate_tag.tag IN (
            SELECT tag FROM message_tags WHERE message_id = ?
          )) DESC,
         CASE WHEN m.channel_id = ? THEN 0 ELSE 1 END,
         ABS(m.published_at - ?) ASC,
         m.published_at DESC
       LIMIT 6`,
    )
      .bind(
        target.id,
        target.channel_id,
        target.id,
        target.id,
        target.channel_id,
        target.published_at,
      )
      .all<MessageRow>(),
  ]);

  const response: MessageDiscoveryContext = {
    previous: previous ? messageRowToPublic(previous, env.MEDIA_BASE_URL) : null,
    next: next ? messageRowToPublic(next, env.MEDIA_BASE_URL) : null,
    related: (related.results ?? []).map((row) => messageRowToPublic(row, env.MEDIA_BASE_URL)),
  };
  return json(response);
}

async function channelForChat(env: Env, chat: TelegramMessage["chat"]): Promise<ChannelRow | null> {
  const chatId = String(chat.id);
  let channel = await env.DB.prepare(
    "SELECT * FROM channels WHERE telegram_chat_id = ? AND enabled = 1",
  )
    .bind(chatId)
    .first<ChannelRow>();
  if (!channel && chat.username) {
    channel = await env.DB.prepare(
      "SELECT * FROM channels WHERE lower(username) = lower(?) AND enabled = 1",
    )
      .bind(chat.username)
      .first<ChannelRow>();
    if (channel && channel.telegram_chat_id !== chatId) {
      await env.DB.prepare(
        "UPDATE channels SET telegram_chat_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
        .bind(chatId, channel.id)
        .run();
    }
  }
  return channel;
}

async function persistMessage(
  env: Env,
  channel: ChannelRow,
  message: TelegramMessage,
  update: TelegramUpdate,
): Promise<{ id: string; media: StoredMedia[] }> {
  const existing = await env.DB.prepare(
    `SELECT id, admin_override FROM messages
     WHERE COALESCE(origin_channel_id, channel_id) = ? AND telegram_message_id = ? LIMIT 1`,
  )
    .bind(channel.id, message.message_id)
    .first<{ id: string; admin_override: number }>();
  const id = existing?.id ?? stableMessageId(channel.id, message.message_id);
  const text = message.text ?? message.caption ?? "";
  const entities = message.entities ?? message.caption_entities ?? [];
  const time = shanghaiDate(message.date);
  const media = messageMedia(message);
  const archiveStatus = media.length ? "pending" : "none";
  const replyTarget = message.reply_to_message
    ? await env.DB.prepare(
        `SELECT id FROM messages
         WHERE COALESCE(origin_channel_id, channel_id) = ? AND telegram_message_id = ? LIMIT 1`,
      )
        .bind(channel.id, message.reply_to_message.message_id)
        .first<{ id: string }>()
    : null;
  const replyTo = message.reply_to_message
    ? replyTarget?.id ?? stableMessageId(channel.id, message.reply_to_message.message_id)
    : null;
  const sourceUrl = `https://t.me/${channel.username}/${message.message_id}`;
  const tags = extractTags(text);
  const statements = [
    env.DB.prepare(
      `INSERT INTO messages (
         id, channel_id, origin_channel_id, telegram_message_id, source_url, date, datetime,
         published_at, published_year, published_month, sender, html, plain_text,
         media, reply_to, reactions, raw_payload, media_archive_status, status,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, 'published', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(origin_channel_id, telegram_message_id) DO UPDATE SET
         source_url = excluded.source_url,
         channel_id = CASE WHEN messages.admin_override = 1 THEN messages.channel_id ELSE excluded.channel_id END,
         date = CASE WHEN messages.admin_override = 1 THEN messages.date ELSE excluded.date END,
         datetime = CASE WHEN messages.admin_override = 1 THEN messages.datetime ELSE excluded.datetime END,
         published_at = CASE WHEN messages.admin_override = 1 THEN messages.published_at ELSE excluded.published_at END,
         published_year = CASE WHEN messages.admin_override = 1 THEN messages.published_year ELSE excluded.published_year END,
         published_month = CASE WHEN messages.admin_override = 1 THEN messages.published_month ELSE excluded.published_month END,
         sender = excluded.sender,
         html = CASE WHEN messages.admin_override = 1 THEN messages.html ELSE excluded.html END,
         plain_text = CASE WHEN messages.admin_override = 1 THEN messages.plain_text ELSE excluded.plain_text END,
         media = excluded.media,
         reply_to = excluded.reply_to,
         raw_payload = excluded.raw_payload,
         media_archive_status = excluded.media_archive_status,
         media_retry_count = 0,
         media_last_error = NULL,
         media_next_retry_at = NULL,
         media_retry_exhausted = 0,
         status = CASE WHEN messages.admin_override = 1 THEN messages.status ELSE 'published' END,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      id,
      channel.id,
      channel.id,
      message.message_id,
      sourceUrl,
      time.date,
      time.datetime,
      message.date,
      time.year,
      time.month,
      message.sender_chat?.title ?? message.chat.title ?? channel.title,
      telegramTextToHtml(text, entities),
      text,
      JSON.stringify(media),
      replyTo,
      JSON.stringify(update),
      archiveStatus,
    ),
    ...(existing?.admin_override
      ? []
      : [
          env.DB.prepare("DELETE FROM message_tags WHERE message_id = ?").bind(id),
          ...tags.map((tag) =>
            env.DB.prepare("INSERT OR IGNORE INTO message_tags(message_id, tag) VALUES (?, ?)").bind(
              id,
              tag,
            ),
          ),
        ]),
    env.DB.prepare(
      `UPDATE channels SET last_webhook_at = CURRENT_TIMESTAMP,
       last_synced_message_id = CASE
         WHEN last_synced_message_id IS NULL OR last_synced_message_id < ? THEN ?
         ELSE last_synced_message_id END,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(message.message_id, message.message_id, channel.id),
  ];
  await env.DB.batch(statements);
  return { id, media };
}

async function isTombstoned(
  env: Env,
  channel: ChannelRow,
  telegramMessageId: number,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT message_id FROM message_tombstones
     WHERE telegram_message_id = ?
       AND (origin_channel_id = ? OR (telegram_chat_id IS NOT NULL AND telegram_chat_id = ?))
     LIMIT 1`,
  )
    .bind(telegramMessageId, channel.id, channel.telegram_chat_id)
    .first<{ message_id: string }>();
  return Boolean(row);
}

async function archiveAndUpdate(
  env: Env,
  id: string,
  channel: ChannelRow,
  telegramMessageId: number,
  media: StoredMedia[],
): Promise<void> {
  if (!media.length) return;
  let attempted = media;
  try {
    attempted = await archiveMedia(
      env,
      media,
      channel.id,
      channel.username,
      telegramMessageId,
    );
    const status = attempted.every((item) => item.archiveStatus === "archived")
      ? "archived"
      : attempted.some((item) => item.archiveStatus === "failed")
        ? "failed"
        : "external";
    await env.DB.prepare(
      `UPDATE messages SET media = ?, media_archive_status = ?,
       media_retry_count = 0, media_last_error = NULL, media_next_retry_at = NULL,
       media_retry_exhausted = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    )
      .bind(JSON.stringify(attempted), status, id)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Media archive failed";
    const failed = error instanceof MediaArchiveError
      ? error.media
      : attempted.map((item) => ({ ...item, archiveStatus: "failed" as const }));
    const current = await env.DB.prepare(
      "SELECT media_retry_count FROM messages WHERE id = ?",
    )
      .bind(id)
      .first<{ media_retry_count: number }>();
    const failureCount = Number(current?.media_retry_count ?? 0) + 1;
    const permanent = error instanceof MediaArchiveError && error.permanent;
    const delay = mediaRetryDelayMs(failureCount);
    const exhausted = permanent || failureCount >= MEDIA_MAX_RETRY_ATTEMPTS || delay === null;
    const nextRetryAt = exhausted || delay === null
      ? null
      : new Date(Date.now() + delay).toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE messages SET media = ?, media_archive_status = 'failed',
         media_retry_count = ?, media_last_error = ?, media_next_retry_at = ?,
         media_retry_exhausted = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(JSON.stringify(failed), failureCount, message, nextRetryAt, exhausted ? 1 : 0, id),
      env.DB.prepare(
        `INSERT INTO sync_logs(channel_id, source, status, message, details)
         VALUES (?, 'media', 'failed', ?, ?)`,
      ).bind(channel.id, message, JSON.stringify({ failureCount, exhausted, permanent })),
    ]);
  }
}

async function processReaction(
  env: Env,
  reaction: TelegramReactionUpdate,
): Promise<{ channel: ChannelRow | null; status: "success" | "ignored" }> {
  const channel = await channelForChat(env, reaction.chat);
  if (!channel) return { channel: null, status: "ignored" };
  if (await isTombstoned(env, channel, reaction.message_id)) {
    return { channel, status: "ignored" };
  }
  const reactions = reaction.reactions.map((item) => ({
    emoji:
      item.type.emoji ??
      (item.type.type === "paid"
        ? "⭐"
        : item.type.custom_emoji_id
          ? `custom:${item.type.custom_emoji_id}`
          : item.type.type),
    count: item.total_count,
  }));
  const engagementScore = reaction.reactions.reduce(
    (total, item) => total + Math.max(0, Number(item.total_count) || 0),
    0,
  );
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE messages SET reactions = ?, engagement_score = ?, updated_at = CURRENT_TIMESTAMP
       WHERE COALESCE(origin_channel_id, channel_id) = ? AND telegram_message_id = ?`,
    ).bind(
      JSON.stringify(reactions),
      engagementScore,
      channel.id,
      reaction.message_id,
    ),
    env.DB.prepare(
      "UPDATE channels SET last_webhook_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(channel.id),
  ]);
  if ((results[0]?.meta.changes ?? 0) === 0) {
    throw new Error("Reaction target message was not found");
  }
  return { channel, status: "success" };
}

async function claimWebhookUpdate(
  env: Env,
  updateId: string,
): Promise<{ attemptCount: number } | null> {
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO webhook_updates(
       update_id, status, attempt_count, last_attempt_at
     ) VALUES (?, 'processing', 1, CURRENT_TIMESTAMP)`,
  )
    .bind(updateId)
    .run();
  if ((inserted.meta.changes ?? 0) > 0) return { attemptCount: 1 };

  const leaseMinutes = Math.floor(WEBHOOK_PROCESSING_LEASE_MS / 60_000);
  const reclaimed = await env.DB.prepare(
    `UPDATE webhook_updates
     SET status = 'processing', error = NULL, processed_at = NULL,
         attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP
     WHERE update_id = ? AND (
       status = 'failed' OR (
         status = 'processing' AND (
           last_attempt_at IS NULL OR
           datetime(last_attempt_at) <= datetime(CURRENT_TIMESTAMP, ?)
         )
       )
     )`,
  )
    .bind(updateId, `-${leaseMinutes} minutes`)
    .run();
  if ((reclaimed.meta.changes ?? 0) !== 1) return null;
  const row = await env.DB.prepare(
    "SELECT attempt_count FROM webhook_updates WHERE update_id = ?",
  )
    .bind(updateId)
    .first<{ attempt_count: number }>();
  return row ? { attemptCount: Number(row.attempt_count) } : null;
}

async function telegramWebhook(
  request: Request,
  env: Env,
  context?: ExecutionContextLike,
): Promise<Response> {
  if (
    !(await secretsMatch(
      request.headers.get("X-Telegram-Bot-Api-Secret-Token"),
      env.TELEGRAM_WEBHOOK_SECRET,
    ))
  ) {
    return errorResponse(401, "Invalid webhook secret");
  }
  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return errorResponse(400, "Invalid JSON");
  }
  if (!Number.isInteger(update.update_id)) return errorResponse(400, "Missing update_id");
  const updateId = String(update.update_id);
  const claim = await claimWebhookUpdate(env, updateId);
  if (!claim) return new Response(null, { status: 204 });

  try {
    const message = update.channel_post ?? update.edited_channel_post;
    if (message) {
      const channel = await channelForChat(env, message.chat);
      if (!channel) {
        await env.DB.prepare(
          `UPDATE webhook_updates SET status = 'ignored', processed_at = CURRENT_TIMESTAMP
           WHERE update_id = ? AND status = 'processing' AND attempt_count = ?`,
        )
          .bind(updateId, claim.attemptCount)
          .run();
        return new Response(null, { status: 204 });
      }
      if (await isTombstoned(env, channel, message.message_id)) {
        await env.DB.prepare(
          `UPDATE webhook_updates SET channel_id = ?, telegram_message_id = ?,
           status = 'ignored', processed_at = CURRENT_TIMESTAMP
           WHERE update_id = ? AND status = 'processing' AND attempt_count = ?`,
        )
          .bind(channel.id, message.message_id, updateId, claim.attemptCount)
          .run();
        return new Response(null, { status: 204 });
      }
      const persisted = await persistMessage(env, channel, message, update);
      const archive = archiveAndUpdate(
        env,
        persisted.id,
        channel,
        message.message_id,
        persisted.media,
      );
      if (context) context.waitUntil(archive);
      else await archive;
      await env.DB.prepare(
        `UPDATE webhook_updates SET channel_id = ?, telegram_message_id = ?,
         status = 'success', processed_at = CURRENT_TIMESTAMP
         WHERE update_id = ? AND status = 'processing' AND attempt_count = ?`,
      )
        .bind(channel.id, message.message_id, updateId, claim.attemptCount)
        .run();
    } else if (update.message_reaction_count) {
      const reaction = await processReaction(env, update.message_reaction_count);
      await env.DB.prepare(
        `UPDATE webhook_updates SET channel_id = ?, telegram_message_id = ?, status = ?,
         processed_at = CURRENT_TIMESTAMP
         WHERE update_id = ? AND status = 'processing' AND attempt_count = ?`,
      )
        .bind(
          reaction.channel?.id ?? null,
          update.message_reaction_count.message_id,
          reaction.status,
          updateId,
          claim.attemptCount,
        )
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE webhook_updates SET status = 'ignored', processed_at = CURRENT_TIMESTAMP
         WHERE update_id = ? AND status = 'processing' AND attempt_count = ?`,
      )
        .bind(updateId, claim.attemptCount)
        .run();
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Webhook failed";
    await env.DB.prepare(
      `UPDATE webhook_updates SET status = 'failed', error = ?, processed_at = CURRENT_TIMESTAMP
       WHERE update_id = ? AND status = 'processing' AND attempt_count = ?`,
    )
      .bind(message, updateId, claim.attemptCount)
      .run();
    return errorResponse(500, "Webhook processing failed");
  }
}

async function saveSiteSetting(env: Env, key: string, value: unknown): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO site_settings(key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(key, JSON.stringify(value))
    .run();
}

async function adminSiteSettings(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const config = await loadSiteConfig(env);
    return json({ ...config.branding, updatedAt: config.updatedAt });
  }
  if (request.method !== "PATCH") return errorResponse(405, "Method not allowed");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "请求内容不是有效 JSON");
  }
  const validated = validateBrandingPatch(body);
  if (!validated.ok) return errorResponse(400, validated.error);
  if (!Object.keys(validated.value).length) return errorResponse(400, "没有可保存的站点字段");
  const current = await loadStoredSiteSettings(env);
  await saveSiteSetting(env, SITE_BRANDING_SETTING_KEY, {
    ...current.branding,
    ...validated.value,
  });
  const config = await loadSiteConfig(env);
  return json({ ...config.branding, updatedAt: config.updatedAt });
}

async function adminSeoSettings(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const config = await loadSiteConfig(env);
    return json({ ...config.seo, updatedAt: config.updatedAt });
  }
  if (request.method !== "PATCH") return errorResponse(405, "Method not allowed");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "请求内容不是有效 JSON");
  }
  const validated = validateSeoPatch(body, env.ENVIRONMENT === "production");
  if (!validated.ok) return errorResponse(400, validated.error);
  if (!Object.keys(validated.value).length) return errorResponse(400, "没有可保存的 SEO 字段");
  const current = await loadStoredSiteSettings(env);
  await saveSiteSetting(env, SITE_SEO_SETTING_KEY, {
    ...current.seo,
    ...validated.value,
  });
  const config = await loadSiteConfig(env);
  return json({ ...config.seo, updatedAt: config.updatedAt });
}

function isSiteAssetType(value: unknown): value is SiteAssetType {
  return value === "logo" || value === "favicon" || value === "og";
}

async function adminSiteAssets(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return errorResponse(405, "Method not allowed");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "上传内容必须使用 multipart/form-data");
  }
  const type = form.get("type");
  const file = form.get("file");
  if (!isSiteAssetType(type)) return errorResponse(400, "资源类型无效");
  if (!(file instanceof File)) return errorResponse(400, "请选择图片文件");
  if (file.size <= 0 || file.size > SITE_ASSET_LIMITS[type]) {
    return errorResponse(413, `文件大小超出 ${Math.round(SITE_ASSET_LIMITS[type] / 1024)} KiB 限制`);
  }
  const bytes = await file.arrayBuffer();
  const detected = detectSiteAsset(bytes, type);
  if (!detected) return errorResponse(415, "图片内容或格式不受支持");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const key = `site/${type}/${hash}.${detected.extension}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: detected.contentType } });
  return json(
    {
      type,
      key,
      url: `${env.MEDIA_BASE_URL.replace(/\/$/, "")}/${key}`,
    },
    201,
  );
}

function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{5,64}$/.test(username) ? username : null;
}

function isBotAdministrator(status: string | undefined): boolean {
  return status === "administrator" || status === "creator";
}

async function getBotIdentity(env: Env): Promise<TelegramBotIdentity> {
  if (!env.TELEGRAM_BOT_TOKEN?.trim()) throw new Error("Telegram Bot Token 未配置");
  return telegramApi<TelegramBotIdentity>(env, "getMe");
}

async function getBotPermission(
  env: Env,
  chatId: string | null,
  botId: number,
): Promise<string> {
  if (!chatId) return "unknown";
  try {
    const member = await telegramApi<{ status?: string }>(env, "getChatMember", {
      chat_id: chatId,
      user_id: botId,
    });
    return member.status ?? "unknown";
  } catch {
    return "unknown";
  }
}

function channelJson(
  row: ChannelRow,
  env: Env,
  botPermission = "unknown",
): Record<string, unknown> {
  return {
    id: row.id,
    username: row.username,
    title: row.title,
    description: row.description,
    avatarUrl: row.avatar_key
      ? `${env.MEDIA_BASE_URL.replace(/\/$/, "")}/${row.avatar_key.replace(/^\//, "")}`
      : null,
    enabled: Boolean(row.enabled),
    messageCount: Number(row.message_count ?? 0),
    sourceMessageCount: Number(row.source_message_count ?? 0),
    deletable: Number(row.message_count ?? 0) === 0 && Number(row.source_message_count ?? 0) === 0,
    telegramChatId: row.telegram_chat_id,
    lastSyncedAt: row.last_synced_at,
    lastWebhookAt: row.last_webhook_at,
    lastSyncedMessageId: row.last_synced_message_id,
    botPermission,
    lastError: row.last_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function adminChannels(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id) AS message_count,
        (SELECT COUNT(*) FROM messages m
         WHERE COALESCE(m.origin_channel_id, m.channel_id) = c.id) AS source_message_count,
        (SELECT message FROM sync_logs s
         WHERE s.channel_id = c.id AND s.status = 'failed'
         ORDER BY s.created_at DESC LIMIT 1) AS last_error
       FROM channels c ORDER BY c.created_at ASC`,
    ).all<ChannelRow>();
    const channels = rows.results ?? [];
    let bot: TelegramBotIdentity | null = null;
    try {
      bot = await getBotIdentity(env);
    } catch {
      // The list remains usable while secrets or Telegram are unavailable.
    }
    const permissions = bot
      ? await Promise.all(
          channels.map((channel) => getBotPermission(env, channel.telegram_chat_id, bot!.id)),
        )
      : channels.map(() => "unconfigured");
    return json(channels.map((row, index) => channelJson(row, env, permissions[index])));
  }
  if (request.method !== "POST") return errorResponse(405, "Method not allowed");
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, "请求内容不是有效 JSON");
  }
  const username = normalizeUsername(body.username);
  if (!username) return errorResponse(400, "Invalid Telegram username");
  const bot = await getBotIdentity(env);
  const chat = await telegramApi<{
    id: number | string;
    title?: string;
    description?: string;
    photo?: { big_file_id: string; big_file_unique_id: string };
  }>(env, "getChat", { chat_id: `@${username}` });
  const member = await telegramApi<{ status?: string }>(env, "getChatMember", {
    chat_id: String(chat.id),
    user_id: bot.id,
  });
  if (!isBotAdministrator(member.status)) {
    return errorResponse(409, "请先将共享 Bot 设置为该频道的管理员");
  }
  const duplicate = await env.DB.prepare(
    "SELECT id FROM channels WHERE lower(username) = lower(?) OR telegram_chat_id = ? LIMIT 1",
  )
    .bind(username, String(chat.id))
    .first<{ id: string }>();
  if (duplicate) return errorResponse(409, "该 Telegram 频道已接入");
  const id =
    typeof body.id === "string" && /^[a-z0-9_-]{2,64}$/.test(body.id)
      ? body.id
      : username.toLocaleLowerCase();
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 120)
      : chat.title ?? username;
  const avatarKey = chat.photo
    ? await archiveBotFile(
        env,
        chat.photo.big_file_id,
        `channels/${id}/avatar-${chat.photo.big_file_unique_id}`,
        "image/jpeg",
      ).catch(() => null)
    : null;
  await env.DB.prepare(
    `INSERT INTO channels (
       id, slug, title, username, telegram_chat_id, telegram_url,
       archive_url, description, avatar_key, enabled, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  )
    .bind(
      id,
      id,
      title,
      username,
      String(chat.id),
      `https://t.me/${username}`,
      `/channel/${id}`,
      typeof body.description === "string"
        ? body.description.slice(0, 500)
        : chat.description?.slice(0, 500) ?? null,
      avatarKey,
      body.enabled === false ? 0 : 1,
    )
    .run();
  const channel = await env.DB.prepare("SELECT * FROM channels WHERE id = ?")
    .bind(id)
    .first<ChannelRow>();
  return json(channel ? channelJson(channel, env, member.status ?? "unknown") : { id }, 201);
}

async function adminChannel(request: Request, env: Env, id: string): Promise<Response> {
  const existing = await env.DB.prepare(
    `SELECT c.*,
       (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id) AS message_count,
       (SELECT COUNT(*) FROM messages m
        WHERE COALESCE(m.origin_channel_id, m.channel_id) = c.id) AS source_message_count
     FROM channels c WHERE c.id = ?`,
  )
    .bind(id)
    .first<ChannelRow>();
  if (!existing) return errorResponse(404, "Channel not found");
  if (request.method === "DELETE") {
    if (Number(existing.message_count ?? 0) > 0 || Number(existing.source_message_count ?? 0) > 0) {
      return errorResponse(409, "A channel with messages cannot be deleted; disable it instead");
    }
    const result = await env.DB.prepare("DELETE FROM channels WHERE id = ?").bind(id).run();
    return (result.meta.changes ?? 0) > 0
      ? new Response(null, { status: 204 })
      : errorResponse(404, "Channel not found");
  }
  if (request.method !== "PATCH") return errorResponse(405, "Method not allowed");
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, "请求内容不是有效 JSON");
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  if (typeof body.title === "string" && body.title.trim()) {
    sets.push("title = ?");
    values.push(body.title.trim().slice(0, 120));
  }
  if (typeof body.description === "string" || body.description === null) {
    sets.push("description = ?");
    values.push(typeof body.description === "string" ? body.description.slice(0, 500) : null);
  }
  if (typeof body.enabled === "boolean") {
    sets.push("enabled = ?");
    values.push(body.enabled ? 1 : 0);
  }
  if (body.username !== undefined) {
    const username = normalizeUsername(body.username);
    if (!username) return errorResponse(400, "Invalid Telegram username");
    const bot = await getBotIdentity(env);
    const chat = await telegramApi<{
      id: number | string;
      photo?: { big_file_id: string; big_file_unique_id: string };
    }>(env, "getChat", { chat_id: `@${username}` });
    const resolvedChatId = String(chat.id);
    if (
      Number(existing.source_message_count ?? 0) > 0 &&
      existing.telegram_chat_id &&
      resolvedChatId !== existing.telegram_chat_id
    ) {
      return errorResponse(409, "已有消息的频道只能更新为同一 Telegram 频道的新 username");
    }
    const duplicate = await env.DB.prepare(
      `SELECT id FROM channels
       WHERE id <> ? AND (lower(username) = lower(?) OR telegram_chat_id = ?) LIMIT 1`,
    )
      .bind(id, username, resolvedChatId)
      .first<{ id: string }>();
    if (duplicate) return errorResponse(409, "该 Telegram 频道已由其他记录接入");
    const member = await telegramApi<{ status?: string }>(env, "getChatMember", {
      chat_id: resolvedChatId,
      user_id: bot.id,
    });
    if (!isBotAdministrator(member.status)) {
      return errorResponse(409, "请先将共享 Bot 设置为该频道的管理员");
    }
    sets.push("username = ?", "telegram_chat_id = ?", "telegram_url = ?");
    values.push(username, resolvedChatId, `https://t.me/${username}`);
    if (chat.photo) {
      const avatarKey = await archiveBotFile(
        env,
        chat.photo.big_file_id,
        `channels/${id}/avatar-${chat.photo.big_file_unique_id}`,
        "image/jpeg",
      ).catch(() => null);
      if (avatarKey) {
        sets.push("avatar_key = ?");
        values.push(avatarKey);
      }
    }
  }
  if (!sets.length) return errorResponse(400, "No supported fields supplied");
  values.push(id);
  const result = await env.DB.prepare(
    `UPDATE channels SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  )
    .bind(...values)
    .run();
  if ((result.meta.changes ?? 0) === 0) return errorResponse(404, "Channel not found");
  const channel = await env.DB.prepare("SELECT * FROM channels WHERE id = ?")
    .bind(id)
    .first<ChannelRow>();
  return json(channelJson(channel!, env));
}

function telegramErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Telegram 请求失败";
  return message.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[redacted]").slice(0, 240);
}

async function telegramStatus(env: Env): Promise<Response> {
  const tokenConfigured = Boolean(env.TELEGRAM_BOT_TOKEN?.trim());
  const secretConfigured = Boolean(env.TELEGRAM_WEBHOOK_SECRET?.trim());
  const [log, counts] = await Promise.all([
    env.DB.prepare(
      `SELECT channel_id AS channelId, source, status, message, created_at AS createdAt
       FROM sync_logs ORDER BY created_at DESC LIMIT 1`,
    ).first(),
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_updates,
         SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_updates
       FROM webhook_updates`,
    ).first(),
  ]);
  let bot: TelegramBotIdentity | null = null;
  let webhook: TelegramWebhookInfo | null = null;
  let connectionError: string | null = null;
  if (tokenConfigured) {
    try {
      [bot, webhook] = await Promise.all([
        getBotIdentity(env),
        telegramApi<TelegramWebhookInfo>(env, "getWebhookInfo"),
      ]);
    } catch (error) {
      connectionError = telegramErrorMessage(error);
    }
  }
  return json({
    configured: { botToken: tokenConfigured, webhookSecret: secretConfigured },
    expectedWebhookUrl: `${env.SITE_URL.replace(/\/$/, "")}/api/telegram/webhook`,
    bot,
    webhook,
    connectionError,
    latestLog: log,
    updates: counts,
  });
}

async function testTelegramConnection(env: Env): Promise<Response> {
  if (!env.TELEGRAM_BOT_TOKEN?.trim()) return errorResponse(409, "Telegram Bot Token 未配置");
  try {
    return json({ ok: true, bot: await getBotIdentity(env) });
  } catch (error) {
    return errorResponse(502, telegramErrorMessage(error));
  }
}

async function configureTelegramWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.TELEGRAM_BOT_TOKEN?.trim() || !env.TELEGRAM_WEBHOOK_SECRET?.trim()) {
    return errorResponse(409, "请先配置 Telegram Bot Token 与 Webhook Secret");
  }
  try {
    if (request.method === "PUT") {
      await telegramApi<boolean>(env, "setWebhook", {
        url: `${env.SITE_URL.replace(/\/$/, "")}/api/telegram/webhook`,
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ["channel_post", "edited_channel_post", "message_reaction_count"],
        drop_pending_updates: false,
      });
    } else if (request.method === "DELETE") {
      await telegramApi<boolean>(env, "deleteWebhook", { drop_pending_updates: false });
    } else {
      return errorResponse(405, "Method not allowed");
    }
    return json({
      ok: true,
      webhook: await telegramApi<TelegramWebhookInfo>(env, "getWebhookInfo"),
    });
  } catch (error) {
    return errorResponse(502, telegramErrorMessage(error));
  }
}

async function prepareMessageMediaRetry(
  env: Env,
  id: string,
  manual = true,
): Promise<
  | { ok: false; status: number; error: string }
  | { ok: true; run: () => Promise<void> }
> {
  const row = await env.DB.prepare(
    `SELECT m.raw_payload, m.telegram_message_id, m.media, c.*
     FROM messages m
     JOIN channels c ON c.id = COALESCE(m.origin_channel_id, m.channel_id)
     WHERE m.id = ? AND m.status IN ('published', 'hidden')`,
  )
    .bind(id)
    .first<ChannelRow & { raw_payload: string; telegram_message_id: number; media: string }>();
  if (!row) return { ok: false, status: 404, error: "Message not found" };
  const update = safeJsonParse<TelegramUpdate | null>(row.raw_payload, null);
  const message = update?.channel_post ?? update?.edited_channel_post;
  const storedMedia = safeJsonParse<StoredMedia[]>(row.media, []);
  const media = storedMedia.length ? storedMedia : message ? messageMedia(message) : [];
  if (!media.length) {
    return { ok: false, status: 409, error: "Message has no retryable Telegram media" };
  }
  await env.DB.prepare(
    manual
      ? `UPDATE messages SET media_archive_status = 'pending', media_retry_count = 0,
         media_last_error = NULL, media_next_retry_at = NULL, media_retry_exhausted = 0,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      : `UPDATE messages SET media_archive_status = 'pending', media_next_retry_at = NULL,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  )
    .bind(id)
    .run();
  return {
    ok: true,
    run: () => archiveAndUpdate(env, id, row, row.telegram_message_id, media),
  };
}

async function retryMessageMedia(env: Env, id: string, manual = true): Promise<Response> {
  const prepared = await prepareMessageMediaRetry(env, id, manual);
  if (!prepared.ok) return errorResponse(prepared.status, prepared.error);
  await prepared.run();
  const result = await env.DB.prepare(
    "SELECT media_archive_status AS archiveStatus FROM messages WHERE id = ?",
  )
    .bind(id)
    .first();
  return json(result);
}

async function loadAdminMessage(env: Env, id: string): Promise<AdminMessageRow | null> {
  return env.DB.prepare(
    `${ADMIN_MESSAGE_SELECT} WHERE m.id = ? AND m.status IN ('published', 'hidden')`,
  )
    .bind(id)
    .first<AdminMessageRow>();
}

async function adminDashboard(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");
  const [messages, channels, updates, cleanups, recent, logs] = await Promise.all([
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status IN ('published', 'hidden') THEN 1 ELSE 0 END) AS total,
         SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
         SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END) AS hidden,
         SUM(CASE WHEN media_archive_status = 'failed' AND status IN ('published', 'hidden') THEN 1 ELSE 0 END) AS failed_media,
         SUM(CASE WHEN media_archive_status = 'pending' AND status IN ('published', 'hidden') THEN 1 ELSE 0 END) AS pending_media
       FROM messages`,
    ).first<Record<string, number | null>>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled
       FROM channels`,
    ).first<Record<string, number | null>>(),
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing
       FROM webhook_updates`,
    ).first<Record<string, number | null>>(),
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN cleanup_status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN cleanup_status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM message_tombstones`,
    ).first<Record<string, number | null>>(),
    env.DB.prepare(
      `${ADMIN_MESSAGE_SELECT}
       WHERE m.status IN ('published', 'hidden')
       ORDER BY m.updated_at DESC, m.id DESC LIMIT 6`,
    ).all<AdminMessageRow>(),
    env.DB.prepare(
      `SELECT id, channel_id AS channelId, source, status, message,
              details, created_at AS createdAt
       FROM sync_logs ORDER BY created_at DESC LIMIT 8`,
    ).all(),
  ]);
  return json({
    summary: {
      totalMessages: Number(messages?.total ?? 0),
      publishedMessages: Number(messages?.published ?? 0),
      hiddenMessages: Number(messages?.hidden ?? 0),
      failedMedia: Number(messages?.failed_media ?? 0),
      pendingMedia: Number(messages?.pending_media ?? 0),
      totalChannels: Number(channels?.total ?? 0),
      enabledChannels: Number(channels?.enabled ?? 0),
      failedUpdates: Number(updates?.failed ?? 0),
      processingUpdates: Number(updates?.processing ?? 0),
      pendingCleanup: Number(cleanups?.pending ?? 0),
      failedCleanup: Number(cleanups?.failed ?? 0),
    },
    recentMessages: (recent.results ?? []).map((row) => adminMessageJson(row, env)),
    recentLogs: logs.results ?? [],
    generatedAt: new Date().toISOString(),
  });
}

async function adminMessages(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");
  const url = new URL(request.url);
  const page = parseInteger(url.searchParams.get("page"), 1, 1, 100_000);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const channel = (url.searchParams.get("channel") ?? "").trim();
  const status = parseAdminMessageStatus(url.searchParams.get("status"));
  const mediaStatus = parseAdminMediaStatus(url.searchParams.get("mediaStatus"));
  const sort = parseAdminMessageSort(url.searchParams.get("sort"));
  if (channel && !/^[a-z0-9_-]{2,64}$/.test(channel)) return errorResponse(400, "Invalid channel");
  if (!status) return errorResponse(400, "Invalid status");
  if (!mediaStatus) return errorResponse(400, "Invalid media status");
  if (!sort) return errorResponse(400, "Invalid sort");

  const values: unknown[] = [];
  let where = " WHERE m.status IN ('published', 'hidden')";
  if (channel) {
    where += " AND m.channel_id = ?";
    values.push(channel);
  }
  if (status !== "all") {
    where += " AND m.status = ?";
    values.push(status);
  }
  if (mediaStatus !== "all") {
    where += " AND m.media_archive_status = ?";
    values.push(mediaStatus);
  }
  where += searchClause(query, values);
  const order = sort === "oldest"
    ? "m.published_at ASC, m.id ASC"
    : sort === "updated"
      ? "m.updated_at DESC, m.id DESC"
      : "m.published_at DESC, m.id DESC";

  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM messages m${where}`)
    .bind(...values)
    .first<{ count: number }>();
  const total = Number(count?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const [rows, channels] = await Promise.all([
    env.DB.prepare(`${ADMIN_MESSAGE_SELECT}${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .bind(...values, PAGE_SIZE, (safePage - 1) * PAGE_SIZE)
      .all<AdminMessageRow>(),
    env.DB.prepare(
      `SELECT id, title, username, enabled FROM channels ORDER BY title ASC, id ASC`,
    ).all<{ id: string; title: string; username: string; enabled: number }>(),
  ]);
  return json({
    items: (rows.results ?? []).map((row) => adminMessageJson(row, env)),
    page: safePage,
    total,
    totalPages,
    channels: (channels.results ?? []).map((item) => ({ ...item, enabled: Boolean(item.enabled) })),
  });
}

async function patchAdminMessage(
  request: Request,
  env: Env,
  id: string,
  adminEmail: string,
): Promise<Response> {
  const existing = await loadAdminMessage(env, id);
  if (!existing) return errorResponse(404, "Message not found");
  let body: Record<string, unknown>;
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    body = value as Record<string, unknown>;
  } catch {
    return errorResponse(400, "请求内容不是有效 JSON");
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  let tags: string[] | null = null;
  let locksTelegramContent = false;
  if (body.plainText !== undefined) {
    if (typeof body.plainText !== "string" || [...body.plainText].length > 10_000) {
      return errorResponse(400, "正文最多 10,000 个字符");
    }
    sets.push("plain_text = ?", "html = ?");
    values.push(body.plainText, plainTextToSafeHtml(body.plainText));
    locksTelegramContent = true;
  }
  if (body.tags !== undefined) {
    const normalized = normalizeAdminTags(body.tags);
    if (!normalized.ok) return errorResponse(400, normalized.error);
    tags = normalized.value;
    locksTelegramContent = true;
  }
  if (body.displayTitle !== undefined) {
    if (body.displayTitle !== null && typeof body.displayTitle !== "string") {
      return errorResponse(400, "展示标题必须是字符串");
    }
    const value = typeof body.displayTitle === "string" ? body.displayTitle.trim() : "";
    if ([...value].length > 80) return errorResponse(400, "展示标题最多 80 个字符");
    sets.push("display_title = ?");
    values.push(value || null);
  }
  if (body.displaySummary !== undefined) {
    if (body.displaySummary !== null && typeof body.displaySummary !== "string") {
      return errorResponse(400, "展示摘要必须是字符串");
    }
    const value = typeof body.displaySummary === "string" ? body.displaySummary.trim() : "";
    if ([...value].length > 240) return errorResponse(400, "展示摘要最多 240 个字符");
    sets.push("display_summary = ?");
    values.push(value || null);
  }
  if (body.isFeatured !== undefined) {
    if (typeof body.isFeatured !== "boolean") return errorResponse(400, "精选状态无效");
    sets.push("is_featured = ?");
    values.push(body.isFeatured ? 1 : 0);
  }
  if (body.featuredOrder !== undefined) {
    if (!Number.isInteger(body.featuredOrder) || Number(body.featuredOrder) < 0 || Number(body.featuredOrder) > 9999) {
      return errorResponse(400, "精选顺序必须是 0–9999 的整数");
    }
    sets.push("featured_order = ?");
    values.push(Number(body.featuredOrder));
  }
  if (body.channelId !== undefined) {
    if (typeof body.channelId !== "string" || !/^[a-z0-9_-]{2,64}$/.test(body.channelId)) {
      return errorResponse(400, "展示频道无效");
    }
    const channel = await env.DB.prepare("SELECT id FROM channels WHERE id = ?")
      .bind(body.channelId)
      .first<{ id: string }>();
    if (!channel) return errorResponse(400, "展示频道不存在");
    const duplicate = await env.DB.prepare(
      `SELECT id FROM messages
       WHERE channel_id = ? AND telegram_message_id = ? AND id <> ? LIMIT 1`,
    )
      .bind(body.channelId, existing.telegram_message_id, id)
      .first<{ id: string }>();
    if (duplicate) return errorResponse(409, "目标频道已有相同 Telegram 消息号");
    sets.push("channel_id = ?");
    values.push(body.channelId);
    locksTelegramContent = true;
  }
  if (body.publishedAt !== undefined) {
    const parsed = parseAdminPublishedAt(body.publishedAt);
    if (!parsed.ok) return errorResponse(400, parsed.error);
    sets.push(
      "published_at = ?",
      "date = ?",
      "datetime = ?",
      "published_year = ?",
      "published_month = ?",
    );
    values.push(
      parsed.epochSeconds,
      parsed.date.date,
      parsed.date.datetime,
      parsed.date.year,
      parsed.date.month,
    );
    locksTelegramContent = true;
  }
  if (body.status !== undefined) {
    if (body.status !== "published" && body.status !== "hidden") {
      return errorResponse(400, "发布状态无效");
    }
    sets.push("status = ?");
    values.push(body.status);
    locksTelegramContent = true;
  }
  if (!sets.length && tags === null) return errorResponse(400, "没有可保存的消息字段");

  if (locksTelegramContent) sets.push("admin_override = 1");
  sets.push(
    "admin_updated_at = CURRENT_TIMESTAMP",
    "admin_updated_by = ?",
    "updated_at = CURRENT_TIMESTAMP",
  );
  values.push(adminEmail, id);
  const statements = [
    env.DB.prepare(`UPDATE messages SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...values),
  ];
  if (tags !== null) {
    statements.push(env.DB.prepare("DELETE FROM message_tags WHERE message_id = ?").bind(id));
    statements.push(
      ...tags.map((tag) =>
        env.DB.prepare("INSERT OR IGNORE INTO message_tags(message_id, tag) VALUES (?, ?)")
          .bind(id, tag),
      ),
    );
  }
  await env.DB.batch(statements);
  const updated = await loadAdminMessage(env, id);
  return json(adminMessageJson(updated!, env));
}

async function cleanupDeletedMessage(env: Env, messageId: string): Promise<"complete" | "failed"> {
  const tombstone = await env.DB.prepare(
    "SELECT message_id, media_keys, cleanup_status FROM message_tombstones WHERE message_id = ?",
  )
    .bind(messageId)
    .first<TombstoneRow>();
  if (!tombstone) return "complete";
  const keys = safeJsonParse<string[]>(tombstone.media_keys, []);
  try {
    if (keys.length) await env.MEDIA.delete(keys);
    await env.DB.batch([
      env.DB.prepare("UPDATE messages SET reply_to = NULL WHERE reply_to = ?").bind(messageId),
      env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(messageId),
      env.DB.prepare(
        `UPDATE message_tombstones
         SET cleanup_status = 'complete', cleanup_error = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE message_id = ?`,
      ).bind(messageId),
    ]);
    return "complete";
  } catch (error) {
    await env.DB.prepare(
      `UPDATE message_tombstones
       SET cleanup_status = 'failed', cleanup_error = ?, updated_at = CURRENT_TIMESTAMP
       WHERE message_id = ?`,
    )
      .bind(error instanceof Error ? error.message.slice(0, 500) : "R2 cleanup failed", messageId)
      .run();
    return "failed";
  }
}

async function deleteAdminMessage(
  env: Env,
  id: string,
  adminEmail: string,
): Promise<{ ok: boolean; status: "complete" | "failed"; error?: string }> {
  const row = await env.DB.prepare(
    `SELECT m.id, COALESCE(m.origin_channel_id, m.channel_id) AS origin_channel_id,
            m.telegram_message_id, m.media, c.telegram_chat_id
     FROM messages m
     JOIN channels c ON c.id = COALESCE(m.origin_channel_id, m.channel_id)
     WHERE m.id = ? AND m.status IN ('published', 'hidden')`,
  )
    .bind(id)
    .first<{
      id: string;
      origin_channel_id: string;
      telegram_message_id: number;
      telegram_chat_id: string | null;
      media: string;
    }>();
  if (!row) return { ok: false, status: "failed", error: "Message not found" };
  const keys = knownMediaKeys(safeJsonParse<StoredMedia[]>(row.media, []));
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO message_tombstones (
         message_id, origin_channel_id, telegram_chat_id, telegram_message_id,
         media_keys, cleanup_status, cleanup_error, deleted_by, deleted_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(origin_channel_id, telegram_message_id) DO UPDATE SET
         message_id = excluded.message_id,
         telegram_chat_id = excluded.telegram_chat_id,
         media_keys = excluded.media_keys,
         cleanup_status = 'pending',
         cleanup_error = NULL,
         deleted_by = excluded.deleted_by,
         deleted_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      row.id,
      row.origin_channel_id,
      row.telegram_chat_id,
      row.telegram_message_id,
      JSON.stringify(keys),
      adminEmail,
    ),
    env.DB.prepare(
      "UPDATE messages SET status = 'deleting', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(id),
  ]);
  const status = await cleanupDeletedMessage(env, id);
  return {
    ok: status === "complete",
    status,
    ...(status === "failed" ? { error: "消息已隐藏，R2 清理将在维护任务中重试" } : {}),
  };
}

async function adminMessage(
  request: Request,
  env: Env,
  id: string,
  adminEmail: string,
): Promise<Response> {
  if (request.method === "PATCH") return patchAdminMessage(request, env, id, adminEmail);
  if (request.method === "DELETE") {
    const result = await deleteAdminMessage(env, id, adminEmail);
    if (result.error === "Message not found") return errorResponse(404, result.error);
    return json(result, result.status === "complete" ? 200 : 202);
  }
  return errorResponse(405, "Method not allowed");
}

async function setBulkMessageStatus(
  env: Env,
  id: string,
  status: AdminMessageStatus,
  adminEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await env.DB.prepare(
    `UPDATE messages SET status = ?, admin_override = 1,
       admin_updated_at = CURRENT_TIMESTAMP, admin_updated_by = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('published', 'hidden')`,
  )
    .bind(status, adminEmail, id)
    .run();
  return (result.meta.changes ?? 0) > 0
    ? { ok: true }
    : { ok: false, error: "Message not found" };
}

async function adminBulkMessages(
  request: Request,
  env: Env,
  adminEmail: string,
  context?: ExecutionContextLike,
): Promise<Response> {
  if (request.method !== "POST") return errorResponse(405, "Method not allowed");
  let body: { action?: unknown; ids?: unknown };
  try {
    body = (await request.json()) as { action?: unknown; ids?: unknown };
  } catch {
    return errorResponse(400, "请求内容不是有效 JSON");
  }
  if (!isAdminBulkAction(body.action)) return errorResponse(400, "批量操作无效");
  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string" || !id.trim())) {
    return errorResponse(400, "消息 ID 必须是非空字符串数组");
  }
  const ids = [...new Set(body.ids.map((id) => String(id).trim()))];
  const limit = body.action === "retry-media" ? 10 : 30;
  if (!ids.length || ids.length > limit) {
    return errorResponse(400, `本次操作需要选择 1–${limit} 条消息`);
  }
  const results: Array<{ id: string; ok: boolean; status?: string; error?: string }> = [];
  const retryTasks: Promise<void>[] = [];
  for (const id of ids) {
    if (body.action === "publish" || body.action === "hide") {
      const result = await setBulkMessageStatus(
        env,
        id,
        body.action === "publish" ? "published" : "hidden",
        adminEmail,
      );
      results.push({ id, ...result, ...(result.ok ? { status: body.action === "publish" ? "published" : "hidden" } : {}) });
    } else if (body.action === "delete") {
      const result = await deleteAdminMessage(env, id, adminEmail);
      results.push({ id, ok: result.ok, status: result.status, ...(result.error ? { error: result.error } : {}) });
    } else {
      const prepared = await prepareMessageMediaRetry(env, id);
      if (!prepared.ok) results.push({ id, ok: false, error: prepared.error });
      else {
        retryTasks.push(prepared.run());
        results.push({ id, ok: true, status: "queued" });
      }
    }
  }
  if (retryTasks.length) {
    const task = Promise.allSettled(retryTasks).then(() => undefined);
    if (context) context.waitUntil(task);
    else await task;
  }
  return json({
    action: body.action satisfies AdminBulkAction,
    results,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
  }, retryTasks.length && context ? 202 : 200);
}

async function adminApi(
  request: Request,
  env: Env,
  path: string,
  context?: ExecutionContextLike,
): Promise<Response> {
  const principal = await authenticateAdminRequest(request, env);
  if (!principal) return errorResponse(401, "管理员身份已失效，请重新登录");
  if (!["GET", "HEAD"].includes(request.method) && !isSafeMutation(request, env)) {
    return errorResponse(403, "Invalid request origin");
  }
  try {
    if (path === "/api/admin/dashboard") return adminDashboard(request, env);
    if (path === "/api/admin/messages") return adminMessages(request, env);
    if (path === "/api/admin/messages/bulk") {
      return adminBulkMessages(request, env, principal.email, context);
    }
    if (path === "/api/admin/site-settings") return adminSiteSettings(request, env);
    if (path === "/api/admin/seo-settings") return adminSeoSettings(request, env);
    if (path === "/api/admin/site-assets") return adminSiteAssets(request, env);
    if (path === "/api/admin/telegram" && request.method === "GET") return telegramStatus(env);
    if (path === "/api/admin/telegram/test" && request.method === "POST") {
      return testTelegramConnection(env);
    }
    if (path === "/api/admin/telegram/webhook") {
      return configureTelegramWebhook(request, env);
    }
    if (path === "/api/admin/channels") return adminChannels(request, env);
    const channelMatch = path.match(/^\/api\/admin\/channels\/([^/]+)$/);
    if (channelMatch) return adminChannel(request, env, decodeURIComponent(channelMatch[1]));
    if (path === "/api/admin/webhook-status" && request.method === "GET") {
      return telegramStatus(env);
    }
    const retryMatch = path.match(/^\/api\/admin\/messages\/([^/]+)\/retry-media$/);
    if (retryMatch && request.method === "POST") {
      return retryMessageMedia(env, decodeURIComponent(retryMatch[1]));
    }
    const messageMatch = path.match(/^\/api\/admin\/messages\/([^/]+)$/);
    if (messageMatch) {
      return adminMessage(request, env, decodeURIComponent(messageMatch[1]), principal.email);
    }
  } catch (error) {
    console.error("Admin API request failed", {
      path,
      method: request.method,
      message: telegramErrorMessage(error),
    });
    return errorResponse(500, "后台请求处理失败，请稍后重试");
  }
  return errorResponse(404, "Admin API route not found");
}

export async function handleApi(
  request: Request,
  env: Env,
  context?: ExecutionContextLike,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path.startsWith("/api/admin/")) return adminApi(request, env, path, context);
  if (path === "/api/telegram/webhook" && request.method === "POST") {
    return telegramWebhook(request, env, context);
  }
  if (path === "/api/site-config" && request.method === "GET") {
    return json(await loadSiteConfig(env));
  }
  if (path === "/api/messages" && request.method === "GET") return getMessages(request, env);
  if (path === "/api/homepage" && request.method === "GET") return getHomepage(env);
  if (path === "/api/archive-meta" && request.method === "GET") return getArchiveMeta(env);
  const discoveryMatch = path.match(/^\/api\/messages\/([^/]+)\/discovery$/);
  if (discoveryMatch && request.method === "GET") {
    return getMessageDiscoveryContext(decodeURIComponent(discoveryMatch[1]), env);
  }
  const messageMatch = path.match(/^\/api\/messages\/([^/]+)$/);
  if (messageMatch && request.method === "GET") {
    return getMessage(decodeURIComponent(messageMatch[1]), env);
  }
  return errorResponse(404, "API route not found");
}

export async function runHourlyMaintenance(env: Env): Promise<void> {
  try {
    const webhook = await telegramApi<{ url?: string; pending_update_count?: number }>(
      env,
      "getWebhookInfo",
    );
    await env.DB.prepare(
      "INSERT INTO sync_logs(source, status, message, details) VALUES ('cron', 'success', ?, ?)",
    )
      .bind("Telegram webhook health check", JSON.stringify(webhook))
      .run();
  } catch (error) {
    await env.DB.prepare(
      "INSERT INTO sync_logs(source, status, message) VALUES ('cron', 'failed', ?)",
    )
      .bind(error instanceof Error ? error.message.slice(0, 500) : "Webhook health check failed")
      .run();
  }

  const failed = await env.DB.prepare(
    `SELECT id FROM messages
     WHERE status IN ('published', 'hidden')
       AND media_archive_status IN ('pending', 'failed')
       AND media_retry_exhausted = 0
       AND (
         media_next_retry_at IS NULL OR
         datetime(media_next_retry_at) <= CURRENT_TIMESTAMP
       )
     ORDER BY COALESCE(media_next_retry_at, updated_at) ASC, updated_at ASC LIMIT 1`,
  ).first<{ id: string }>();
  if (failed) await retryMessageMedia(env, failed.id, false);

  const cleanup = await env.DB.prepare(
    `SELECT message_id FROM message_tombstones
     WHERE cleanup_status IN ('pending', 'failed')
     ORDER BY updated_at ASC LIMIT 1`,
  ).first<{ message_id: string }>();
  if (cleanup) await cleanupDeletedMessage(env, cleanup.message_id);
}
