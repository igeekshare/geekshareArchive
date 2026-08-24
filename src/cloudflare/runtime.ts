export interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta: { changes?: number; last_row_id?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]>;
}

export interface R2Object {
  key: string;
  size: number;
}

export interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<R2Object | null>;
  delete(keys: string | string[]): Promise<void>;
}

export interface AssetsFetcher {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
}

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: AssetsFetcher;
  SITE_URL: string;
  MEDIA_BASE_URL: string;
  ENVIRONMENT?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_ADMIN_EMAIL?: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
}

export type AdminPrincipal = {
  email: string;
};

export type AdminAccessConfig = {
  teamDomain: string;
  audience: string;
  adminEmail: string;
};

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ScheduledControllerLike {
  scheduledTime: number;
  cron: string;
}

export function json(
  value: unknown,
  status = 200,
  cacheControl = "no-store",
): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function errorResponse(status: number, message: string): Response {
  return json({ error: message }, status);
}

export function parseInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, parsed))
    : fallback;
}

export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function absoluteMediaUrl(baseUrl: string, key?: string): string | undefined {
  if (!key) return undefined;
  if (/^https?:\/\//i.test(key)) return key;
  return `${baseUrl.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
}

const accessKeySets = new Map<string, JWTVerifyGetKey>();

function accessKeySet(teamDomain: string): JWTVerifyGetKey {
  const cached = accessKeySets.get(teamDomain);
  if (cached) return cached;
  const keySet = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  accessKeySets.set(teamDomain, keySet);
  return keySet;
}

export async function authenticateAdminRequest(
  request: Request,
  env: Env,
): Promise<AdminPrincipal | null> {
  if (env.ENVIRONMENT === "development" || env.ENVIRONMENT === "test") {
    return {
      email: env.CF_ACCESS_ADMIN_EMAIL?.trim().toLowerCase() || "local-admin@localhost",
    };
  }

  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim().replace(/\/$/, "");
  const audience = env.CF_ACCESS_AUD?.trim();
  const adminEmail = env.CF_ACCESS_ADMIN_EMAIL?.trim().toLowerCase();
  const token = request.headers.get("Cf-Access-Jwt-Assertion")?.trim();
  if (!teamDomain || !audience || !adminEmail || !token) return null;

  return verifyAdminAccessToken(
    token,
    { teamDomain, audience, adminEmail },
    accessKeySet(teamDomain),
  );
}

export async function verifyAdminAccessToken(
  token: string,
  config: AdminAccessConfig,
  keySet: JWTVerifyGetKey,
): Promise<AdminPrincipal | null> {
  try {
    const { payload } = await jwtVerify(token, keySet, {
      issuer: config.teamDomain,
      audience: config.audience,
      algorithms: ["RS256"],
    });
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    return email === config.adminEmail ? { email } : null;
  } catch {
    return null;
  }
}

export function isSafeMutation(request: Request, env: Env): boolean {
  if (env.ENVIRONMENT === "development" || env.ENVIRONMENT === "test") return true;
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(env.SITE_URL).origin;
  } catch {
    return false;
  }
}
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
