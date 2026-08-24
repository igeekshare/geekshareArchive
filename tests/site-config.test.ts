import assert from "node:assert/strict";
import test from "node:test";
import { loadSiteConfig } from "../src/cloudflare/api";
import type { Env } from "../src/cloudflare/runtime";
import {
  DEFAULT_BRANDING_SETTINGS,
  DEFAULT_PUBLIC_SITE_CONFIG,
  DEFAULT_SEO_SETTINGS,
  detectSiteAsset,
  normalizeStoredBranding,
  normalizeStoredSeo,
  validateBrandingPatch,
  validateSeoPatch,
} from "../src/lib/site-config";

test("missing and invalid stored settings fall back without losing the site", () => {
  assert.deepEqual(normalizeStoredBranding(null), DEFAULT_BRANDING_SETTINGS);
  assert.equal(normalizeStoredBranding({ siteName: "" }).siteName, DEFAULT_BRANDING_SETTINGS.siteName);
  assert.equal(normalizeStoredBranding({ logoKey: "channels/not-a-site-logo.png" }).logoKey, null);
  assert.equal(normalizeStoredSeo({ canonicalUrl: "javascript:alert(1)" }).canonicalUrl, DEFAULT_SEO_SETTINGS.canonicalUrl);
});

test("public site config falls back when the D1 settings query is unavailable", async () => {
  const env = {
    DB: {
      prepare() {
        throw new Error("D1 unavailable");
      },
    },
  } as unknown as Env;
  assert.deepEqual(await loadSiteConfig(env), DEFAULT_PUBLIC_SITE_CONFIG);
});

test("branding and SEO patches enforce documented lengths and HTTPS production canonical", () => {
  assert.equal(validateBrandingPatch({ siteName: "GeekShare" }).ok, true);
  assert.deepEqual(validateBrandingPatch({ homepageTitle: "" }), {
    ok: false,
    error: "首页标题长度应为 1–100 个字符",
  });
  assert.equal(
    validateSeoPatch({ canonicalUrl: "http://localhost:3000" }, false).ok,
    true,
  );
  assert.deepEqual(validateSeoPatch({ canonicalUrl: "http://example.com" }, true), {
    ok: false,
    error: "生产环境 Canonical URL 必须使用 HTTPS",
  });
  assert.equal(validateSeoPatch({ keywords: Array.from({ length: 31 }, (_, index) => `k${index}`) }).ok, false);
});

test("site uploads are detected from bytes rather than claimed MIME type", () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]).buffer;
  const ico = new Uint8Array([0, 0, 1, 0, 1, 0]).buffer;
  const fake = new Uint8Array([1, 2, 3, 4]).buffer;
  assert.deepEqual(detectSiteAsset(png, "logo"), { extension: "png", contentType: "image/png" });
  assert.deepEqual(detectSiteAsset(jpeg, "og"), { extension: "jpg", contentType: "image/jpeg" });
  assert.deepEqual(detectSiteAsset(ico, "favicon"), { extension: "ico", contentType: "image/x-icon" });
  assert.equal(detectSiteAsset(jpeg, "favicon"), null);
  assert.equal(detectSiteAsset(fake, "logo"), null);
});
