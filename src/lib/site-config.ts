export const SITE_BRANDING_SETTING_KEY = "site.branding.v1";
export const SITE_SEO_SETTING_KEY = "site.seo.v1";

export type SiteAssetType = "logo" | "favicon" | "og";

export const SITE_ASSET_LIMITS: Record<SiteAssetType, number> = {
  logo: 2 * 1024 * 1024,
  favicon: 512 * 1024,
  og: 5 * 1024 * 1024,
};

export const DEFAULT_KEYWORDS = [
  "极客分享",
  "geekshare",
  "Telegram 频道",
  "优质网站推荐",
  "实用工具分享",
  "开源项目推荐",
  "AI 工具",
  "效率软件",
  "科技资源",
];

export type StoredBrandingSettings = {
  siteName: string;
  homepageTitle: string;
  description: string;
  logoKey: string | null;
  faviconKey: string | null;
};

export type StoredSeoSettings = {
  title: string;
  description: string;
  keywords: string[];
  canonicalUrl: string;
  ogImageKey: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
};

export type PublicBrandingSettings = Omit<StoredBrandingSettings, "logoKey" | "faviconKey"> & {
  logoUrl: string | null;
  faviconUrl: string;
};

export type PublicSeoSettings = Omit<StoredSeoSettings, "ogImageKey"> & {
  ogImageUrl: string;
};

export type PublicSiteConfig = {
  branding: PublicBrandingSettings;
  seo: PublicSeoSettings;
  updatedAt: string | null;
};

export const DEFAULT_BRANDING_SETTINGS: StoredBrandingSettings = {
  siteName: "极客分享",
  homepageTitle: "专注技术分享，连接前沿思想",
  description: "实时同步多个 Telegram 频道的精选内容，让技术洞见触手可及。",
  logoKey: null,
  faviconKey: null,
};

export const DEFAULT_SEO_SETTINGS: StoredSeoSettings = {
  title: "极客分享 | 优质网站工具 APP 与开源项目每日更新",
  description:
    "精选优质网站、实用工具与开源项目，聚合 AI、效率应用、编程与科技资源，每日更新。",
  keywords: DEFAULT_KEYWORDS,
  canonicalUrl: "https://example.com",
  ogImageKey: null,
  robotsIndex: true,
  robotsFollow: true,
};

export const DEFAULT_PUBLIC_SITE_CONFIG: PublicSiteConfig = {
  branding: {
    siteName: DEFAULT_BRANDING_SETTINGS.siteName,
    homepageTitle: DEFAULT_BRANDING_SETTINGS.homepageTitle,
    description: DEFAULT_BRANDING_SETTINGS.description,
    logoUrl: null,
    faviconUrl: "/favicon.svg",
  },
  seo: {
    title: DEFAULT_SEO_SETTINGS.title,
    description: DEFAULT_SEO_SETTINGS.description,
    keywords: DEFAULT_SEO_SETTINGS.keywords,
    canonicalUrl: DEFAULT_SEO_SETTINGS.canonicalUrl,
    ogImageUrl: "/og-image.svg",
    robotsIndex: DEFAULT_SEO_SETTINGS.robotsIndex,
    robotsFollow: DEFAULT_SEO_SETTINGS.robotsFollow,
  },
  updatedAt: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, fallback: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed && !allowEmpty) return fallback;
  return trimmed.slice(0, max);
}

function assetKey(value: unknown, fallback: string | null, prefix: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return fallback;
  return value.startsWith(`site/${prefix}/`) ? value : fallback;
}

export function normalizeStoredBranding(value: unknown): StoredBrandingSettings {
  const source = isRecord(value) ? value : {};
  return {
    siteName: boundedString(source.siteName, DEFAULT_BRANDING_SETTINGS.siteName, 60),
    homepageTitle: boundedString(
      source.homepageTitle,
      DEFAULT_BRANDING_SETTINGS.homepageTitle,
      100,
    ),
    description: boundedString(
      source.description,
      DEFAULT_BRANDING_SETTINGS.description,
      300,
      true,
    ),
    logoKey: assetKey(source.logoKey, DEFAULT_BRANDING_SETTINGS.logoKey, "logo"),
    faviconKey: assetKey(source.faviconKey, DEFAULT_BRANDING_SETTINGS.faviconKey, "favicon"),
  };
}

export function normalizeStoredSeo(value: unknown): StoredSeoSettings {
  const source = isRecord(value) ? value : {};
  let canonicalUrl = boundedString(
    source.canonicalUrl,
    DEFAULT_SEO_SETTINGS.canonicalUrl,
    2048,
  );
  try {
    const parsed = new URL(canonicalUrl);
    if (!(["http:", "https:"].includes(parsed.protocol))) throw new Error("unsupported");
    canonicalUrl = parsed.toString().replace(/\/$/, "");
  } catch {
    canonicalUrl = DEFAULT_SEO_SETTINGS.canonicalUrl;
  }

  const keywords = Array.isArray(source.keywords)
    ? Array.from(
        new Set(
          source.keywords
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim().slice(0, 40))
            .filter(Boolean),
        ),
      ).slice(0, 30)
    : DEFAULT_SEO_SETTINGS.keywords;

  return {
    title: boundedString(source.title, DEFAULT_SEO_SETTINGS.title, 70),
    description: boundedString(source.description, DEFAULT_SEO_SETTINGS.description, 180),
    keywords,
    canonicalUrl,
    ogImageKey: assetKey(source.ogImageKey, DEFAULT_SEO_SETTINGS.ogImageKey, "og"),
    robotsIndex:
      typeof source.robotsIndex === "boolean"
        ? source.robotsIndex
        : DEFAULT_SEO_SETTINGS.robotsIndex,
    robotsFollow:
      typeof source.robotsFollow === "boolean"
        ? source.robotsFollow
        : DEFAULT_SEO_SETTINGS.robotsFollow,
  };
}

export function validateBrandingPatch(value: unknown):
  | { ok: true; value: Partial<StoredBrandingSettings> }
  | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "请求内容必须是对象" };
  const result: Partial<StoredBrandingSettings> = {};
  if (value.siteName !== undefined) {
    if (typeof value.siteName !== "string" || !value.siteName.trim() || value.siteName.trim().length > 60) {
      return { ok: false, error: "站点名称长度应为 1–60 个字符" };
    }
    result.siteName = value.siteName.trim();
  }
  if (value.homepageTitle !== undefined) {
    if (
      typeof value.homepageTitle !== "string" ||
      !value.homepageTitle.trim() ||
      value.homepageTitle.trim().length > 100
    ) {
      return { ok: false, error: "首页标题长度应为 1–100 个字符" };
    }
    result.homepageTitle = value.homepageTitle.trim();
  }
  if (value.description !== undefined) {
    if (typeof value.description !== "string" || value.description.trim().length > 300) {
      return { ok: false, error: "站点简介不能超过 300 个字符" };
    }
    result.description = value.description.trim();
  }
  for (const [field, prefix] of [
    ["logoKey", "logo"],
    ["faviconKey", "favicon"],
  ] as const) {
    if (value[field] === undefined) continue;
    if (value[field] !== null && (typeof value[field] !== "string" || !value[field].startsWith(`site/${prefix}/`))) {
      return { ok: false, error: "站点资源标识无效" };
    }
    result[field] = value[field] as string | null;
  }
  return { ok: true, value: result };
}

export function validateSeoPatch(value: unknown, production = false):
  | { ok: true; value: Partial<StoredSeoSettings> }
  | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "请求内容必须是对象" };
  const result: Partial<StoredSeoSettings> = {};
  if (value.title !== undefined) {
    if (typeof value.title !== "string" || !value.title.trim() || value.title.trim().length > 70) {
      return { ok: false, error: "SEO 标题长度应为 1–70 个字符" };
    }
    result.title = value.title.trim();
  }
  if (value.description !== undefined) {
    if (typeof value.description !== "string" || !value.description.trim() || value.description.trim().length > 180) {
      return { ok: false, error: "SEO 描述长度应为 1–180 个字符" };
    }
    result.description = value.description.trim();
  }
  if (value.keywords !== undefined) {
    if (!Array.isArray(value.keywords) || value.keywords.length > 30) {
      return { ok: false, error: "SEO 关键词最多 30 个" };
    }
    const keywords: string[] = [];
    for (const item of value.keywords) {
      if (typeof item !== "string" || !item.trim() || item.trim().length > 40) {
        return { ok: false, error: "每个 SEO 关键词长度应为 1–40 个字符" };
      }
      if (!keywords.includes(item.trim())) keywords.push(item.trim());
    }
    result.keywords = keywords;
  }
  if (value.canonicalUrl !== undefined) {
    if (typeof value.canonicalUrl !== "string") return { ok: false, error: "Canonical URL 无效" };
    try {
      const parsed = new URL(value.canonicalUrl.trim());
      if (!["http:", "https:"].includes(parsed.protocol) || (production && parsed.protocol !== "https:")) {
        return { ok: false, error: production ? "生产环境 Canonical URL 必须使用 HTTPS" : "Canonical URL 必须使用 HTTP(S)" };
      }
      result.canonicalUrl = parsed.toString().replace(/\/$/, "");
    } catch {
      return { ok: false, error: "Canonical URL 必须是绝对地址" };
    }
  }
  if (value.ogImageKey !== undefined) {
    if (value.ogImageKey !== null && (typeof value.ogImageKey !== "string" || !value.ogImageKey.startsWith("site/og/"))) {
      return { ok: false, error: "OG 图片资源标识无效" };
    }
    result.ogImageKey = value.ogImageKey as string | null;
  }
  if (value.robotsIndex !== undefined) {
    if (typeof value.robotsIndex !== "boolean") return { ok: false, error: "robotsIndex 必须是布尔值" };
    result.robotsIndex = value.robotsIndex;
  }
  if (value.robotsFollow !== undefined) {
    if (typeof value.robotsFollow !== "boolean") return { ok: false, error: "robotsFollow 必须是布尔值" };
    result.robotsFollow = value.robotsFollow;
  }
  return { ok: true, value: result };
}

export function assetUrl(baseUrl: string, key: string | null, fallback: string): string {
  if (!key) return fallback;
  return `${baseUrl.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
}

export function detectSiteAsset(
  bytes: ArrayBuffer,
  type: SiteAssetType,
): { extension: "png" | "jpg" | "webp" | "ico"; contentType: string } | null {
  const view = new Uint8Array(bytes);
  const png =
    view.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => view[index] === value);
  if (png) return { extension: "png", contentType: "image/png" };
  const jpeg = view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff;
  if (jpeg && type !== "favicon") return { extension: "jpg", contentType: "image/jpeg" };
  const webp =
    view.length >= 12 &&
    String.fromCharCode(...view.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...view.slice(8, 12)) === "WEBP";
  if (webp && type !== "favicon") return { extension: "webp", contentType: "image/webp" };
  const ico =
    type === "favicon" &&
    view.length >= 4 &&
    view[0] === 0 &&
    view[1] === 0 &&
    view[2] === 1 &&
    view[3] === 0;
  return ico ? { extension: "ico", contentType: "image/x-icon" } : null;
}
