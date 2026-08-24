import assert from "node:assert/strict";
import test from "node:test";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JSONWebKeySet,
} from "jose";
import {
  knownMediaKeys,
  normalizeAdminTags,
  parseAdminMediaStatus,
  parseAdminMessageSort,
  parseAdminMessageStatus,
  parseAdminPublishedAt,
  plainTextToSafeHtml,
} from "../src/cloudflare/admin-content";
import { handleApi } from "../src/cloudflare/api";
import {
  authenticateAdminRequest,
  isSafeMutation,
  verifyAdminAccessToken,
  type AdminAccessConfig,
  type Env,
} from "../src/cloudflare/runtime";

test("admin content filters only accept documented values", () => {
  assert.equal(parseAdminMessageStatus(null), "all");
  assert.equal(parseAdminMessageStatus("hidden"), "hidden");
  assert.equal(parseAdminMessageStatus("deleted"), null);
  assert.equal(parseAdminMediaStatus("failed"), "failed");
  assert.equal(parseAdminMediaStatus("missing"), null);
  assert.equal(parseAdminMessageSort("updated"), "updated");
  assert.equal(parseAdminMessageSort("random"), null);
});

test("admin tags are normalized, deduplicated, and bounded", () => {
  assert.deepEqual(normalizeAdminTags(["#Cloudflare", "cloudflare", "中文标签"]), {
    ok: true,
    value: ["cloudflare", "中文标签"],
  });
  assert.equal(normalizeAdminTags(["bad tag"]).ok, false);
  assert.equal(normalizeAdminTags(Array.from({ length: 31 }, (_, index) => `tag${index}`)).ok, false);
});

test("admin text is escaped and Shanghai-local timestamps derive stable fields", () => {
  assert.equal(plainTextToSafeHtml("<script>\nline"), "&lt;script&gt;<br>line");
  assert.deepEqual(parseAdminPublishedAt("2026-08-19T16:30"), {
    ok: true,
    epochSeconds: 1787128200,
    date: {
      date: "2026-08-19",
      datetime: "2026-08-19T16:30:00+08:00",
      year: "2026",
      month: "2026-08",
    },
  });
  assert.equal(parseAdminPublishedAt("not-a-date").ok, false);
});

test("permanent deletion only selects explicit R2 object keys", () => {
  assert.deepEqual(
    knownMediaKeys([
      { type: "photo", archiveStatus: "archived", r2Key: "/channels/a/photo.jpg", thumbKey: "channels/a/thumb.jpg" },
      { type: "file", archiveStatus: "external", r2Key: "https://example.com/file.pdf" },
      { type: "photo", archiveStatus: "archived", r2Key: "channels/a/photo.jpg" },
    ]),
    ["channels/a/photo.jpg", "channels/a/thumb.jpg"],
  );
});

test("admin Access tokens require the configured signature, claims, and email", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const otherKeys = await generateKeyPair("RS256");
  const keyId = "admin-test-key";
  const publicJwk = await exportJWK(publicKey);
  const keySet = createLocalJWKSet({
    keys: [{ ...publicJwk, kid: keyId, alg: "RS256", use: "sig" }],
  } satisfies JSONWebKeySet);
  const config: AdminAccessConfig = {
    teamDomain: "https://team.cloudflareaccess.com",
    audience: "admin-audience",
    adminEmail: "admin@example.com",
  };
  const sign = (
    overrides: { issuer?: string; audience?: string; email?: string; expiresAt?: number } = {},
    key = privateKey,
  ) => new SignJWT({ email: overrides.email ?? config.adminEmail })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuer(overrides.issuer ?? config.teamDomain)
    .setAudience(overrides.audience ?? config.audience)
    .setIssuedAt()
    .setExpirationTime(overrides.expiresAt ?? Math.floor(Date.now() / 1000) + 300)
    .sign(key);

  const valid = await sign();
  assert.deepEqual(await verifyAdminAccessToken(valid, config, keySet), {
    email: config.adminEmail,
  });
  assert.equal(
    await verifyAdminAccessToken(await sign({ issuer: "https://wrong.cloudflareaccess.com" }), config, keySet),
    null,
  );
  assert.equal(
    await verifyAdminAccessToken(await sign({ audience: "wrong-audience" }), config, keySet),
    null,
  );
  assert.equal(
    await verifyAdminAccessToken(await sign({ email: "visitor@example.com" }), config, keySet),
    null,
  );
  assert.equal(
    await verifyAdminAccessToken(await sign({ expiresAt: Math.floor(Date.now() / 1000) - 60 }), config, keySet),
    null,
  );
  assert.equal(
    await verifyAdminAccessToken(await sign({}, otherKeys.privateKey), config, keySet),
    null,
  );
});

test("production admin routes reject missing JWTs and forged email headers", async () => {
  const env = {
    ENVIRONMENT: "production",
    SITE_URL: "https://archive.example.com",
    CF_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
    CF_ACCESS_AUD: "admin-audience",
    CF_ACCESS_ADMIN_EMAIL: "admin@example.com",
  } as unknown as Env;
  const unauthenticated = await handleApi(
    new Request("https://archive.example.com/api/admin/dashboard"),
    env,
  );
  assert.equal(unauthenticated.status, 401);

  const forgedHeader = new Request("https://archive.example.com/api/admin/dashboard", {
    headers: { "Cf-Access-Authenticated-User-Email": "admin@example.com" },
  });
  assert.equal(await authenticateAdminRequest(forgedHeader, env), null);
  assert.equal((await handleApi(forgedHeader, env)).status, 401);

  const unknownEnvironment = { ...env, ENVIRONMENT: undefined } as unknown as Env;
  assert.equal(await authenticateAdminRequest(forgedHeader, unknownEnvironment), null);
});

test("admin routes keep same-origin and input validation after authentication", async () => {
  const productionEnv = {
    ENVIRONMENT: "production",
    SITE_URL: "https://archive.example.com",
  } as unknown as Env;
  const crossOrigin = new Request("https://archive.example.com/api/admin/messages/message1", {
    method: "PATCH",
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(isSafeMutation(crossOrigin, productionEnv), false);
  assert.equal(
    isSafeMutation(
      new Request("https://archive.example.com/api/admin/messages/message1", {
        method: "PATCH",
        headers: { Origin: "https://archive.example.com" },
      }),
      productionEnv,
    ),
    true,
  );

  const localEnv = {
    ENVIRONMENT: "test",
    SITE_URL: "https://archive.example.com",
    CF_ACCESS_ADMIN_EMAIL: "admin@example.com",
  } as unknown as Env;
  const invalidFilter = await handleApi(
    new Request("https://archive.example.com/api/admin/messages?status=deleted"),
    localEnv,
  );
  assert.equal(invalidFilter.status, 400);
});
