import { findMessage, handleApi, loadSiteConfig, runHourlyMaintenance } from "./cloudflare/api";
import {
  authenticateAdminRequest,
  type Env,
  type ExecutionContextLike,
  type ScheduledControllerLike,
} from "./cloudflare/runtime";
import type { PublicSiteConfig } from "./lib/site-config";

interface HtmlElement {
  setInnerContent(content: string): void;
  setAttribute(name: string, value: string): void;
  append(content: string, options?: { html?: boolean }): void;
}

declare class HTMLRewriter {
  on(selector: string, handlers: { element(element: HtmlElement): void }): HTMLRewriter;
  transform(response: Response): Response;
}

function jsonForHtml(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function absolutePageUrl(value: string, base: string): string {
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

type PageSeo = {
  title: string;
  description: string;
  canonicalUrl: string;
  type: "website" | "article";
};

function rewriteSeo(shell: Response, config: PublicSiteConfig, page: PageSeo): Response {
  const robots = `${config.seo.robotsIndex ? "index" : "noindex"}, ${config.seo.robotsFollow ? "follow" : "nofollow"}`;
  const ogImage = absolutePageUrl(config.seo.ogImageUrl, page.canonicalUrl);
  const favicon = absolutePageUrl(config.branding.faviconUrl, page.canonicalUrl);
  return new HTMLRewriter()
    .on("title", { element: (element) => element.setInnerContent(page.title) })
    .on('meta[name="description"]', { element: (element) => element.setAttribute("content", page.description) })
    .on('meta[name="keywords"]', { element: (element) => element.setAttribute("content", config.seo.keywords.join(", ")) })
    .on('meta[name="robots"]', { element: (element) => element.setAttribute("content", robots) })
    .on('link[rel="canonical"]', { element: (element) => element.setAttribute("href", page.canonicalUrl) })
    .on('link[rel="icon"]', { element: (element) => element.setAttribute("href", favicon) })
    .on('meta[property="og:title"]', { element: (element) => element.setAttribute("content", page.title) })
    .on('meta[property="og:description"]', { element: (element) => element.setAttribute("content", page.description) })
    .on('meta[property="og:url"]', { element: (element) => element.setAttribute("content", page.canonicalUrl) })
    .on('meta[property="og:site_name"]', { element: (element) => element.setAttribute("content", config.branding.siteName) })
    .on('meta[property="og:type"]', { element: (element) => element.setAttribute("content", page.type) })
    .on('meta[property="og:image"]', { element: (element) => element.setAttribute("content", ogImage) })
    .on('meta[name="twitter:title"]', { element: (element) => element.setAttribute("content", page.title) })
    .on('meta[name="twitter:description"]', { element: (element) => element.setAttribute("content", page.description) })
    .on('meta[name="twitter:image"]', { element: (element) => element.setAttribute("content", ogImage) })
    .transform(shell);
}

async function homepage(request: Request, env: Env): Promise<Response> {
  const [shell, config] = await Promise.all([
    env.ASSETS.fetch(request),
    loadSiteConfig(env),
  ]);
  if (!shell.ok || !shell.headers.get("Content-Type")?.includes("text/html")) return shell;
  const canonicalUrl = config.seo.canonicalUrl;
  const transformed = rewriteSeo(shell, config, {
    title: config.seo.title,
    description: config.seo.description,
    canonicalUrl,
    type: "website",
  });
  const headers = new Headers(transformed.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(transformed.body, { status: transformed.status, headers });
}

async function messagePage(request: Request, env: Env, id: string): Promise<Response> {
  const [message, config] = await Promise.all([findMessage(id, env), loadSiteConfig(env)]);
  if (!message) {
    return new Response("Message not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const assetUrl = new URL("/message/", request.url);
  const shell = await env.ASSETS.fetch(new Request(assetUrl, request));
  if (!shell.ok) return shell;
  const description = message.summary || message.plainText.slice(0, 160) || `Telegram 消息 ${message.id}`;
  const canonicalUrl = `${config.seo.canonicalUrl.replace(/\/$/, "")}/message/${encodeURIComponent(id)}`;
  const transformed = new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append(
          `<script id="__MESSAGE_DATA__" type="application/json">${jsonForHtml(message)}</script>`,
          { html: true },
        );
      },
    })
    .transform(
      rewriteSeo(shell, config, {
        title: `${message.title} | ${config.branding.siteName}`,
        description,
        canonicalUrl,
        type: "article",
      }),
    );
  const headers = new Headers(transformed.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(transformed.body, { status: transformed.status, headers });
}

function adminAuthenticationError(request: Request): Response {
  const body = request.method === "HEAD" ? null : `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>管理员身份验证失败 | GeekShare</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f4f5f7; color: #18181b; }
    main { width: min(100%, 440px); border: 1px solid #e4e4e7; border-radius: 16px; background: #fff; padding: 32px; }
    h1 { margin: 0; font-size: 24px; line-height: 1.35; letter-spacing: -0.02em; }
    p { margin: 14px 0 0; color: #52525b; font-size: 14px; line-height: 1.75; }
    a { display: inline-flex; margin-top: 24px; min-height: 40px; align-items: center; justify-content: center; border-radius: 8px; background: #d7262f; padding: 0 16px; color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; }
    a:focus-visible { outline: 2px solid #d7262f; outline-offset: 3px; }
  </style>
</head>
<body>
  <main>
    <h1>管理员身份验证失败</h1>
    <p>登录状态已过期，或 Cloudflare Access 尚未正确配置。请返回管理入口后重新验证身份。</p>
    <a href="/admin/">返回管理入口</a>
  </main>
</body>
</html>`;
  return new Response(body, {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

async function adminPage(request: Request, env: Env): Promise<Response> {
  const principal = await authenticateAdminRequest(request, env);
  if (!principal) return adminAuthenticationError(request);
  const asset = await env.ASSETS.fetch(request);
  const headers = new Headers(asset.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(asset.body, { status: asset.status, headers });
}

const worker = {
  async fetch(request: Request, env: Env, context: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, context);
    if (url.pathname === "/" || url.pathname === "/index.html") return homepage(request, env);
    if (url.pathname.startsWith("/admin/") && url.pathname !== "/admin/") {
      return adminPage(request, env);
    }
    const detail = url.pathname.match(/^\/message\/([^/]+)\/?$/);
    if (detail) return messagePage(request, env, decodeURIComponent(detail[1]));
    return env.ASSETS.fetch(request);
  },

  scheduled(
    _controller: ScheduledControllerLike,
    env: Env,
    context: ExecutionContextLike,
  ): void {
    context.waitUntil(runHourlyMaintenance(env));
  },
};

export default worker;
