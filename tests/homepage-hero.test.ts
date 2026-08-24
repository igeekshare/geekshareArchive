import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HomepageHero from "../src/components/home/HomepageHero";

const branding = {
  siteName: "极客分享",
  homepageTitle: "专注技术分享，连接前沿思想",
  description: "实时同步精选内容。",
  logoUrl: null,
  faviconUrl: "/favicon.svg",
};

test("homepage archive stats use NumberFlow after loading", () => {
  const html = renderToStaticMarkup(createElement(HomepageHero, {
    stats: { messageCount: 12_345, tagCount: 678, channelCount: 9 },
    branding,
    loading: false,
  }));

  assert.equal(html.match(/<number-flow-react>/g)?.length, 3);
  assert.match(html, /aria-label="归档规模"/);
  assert.match(html, /个话题/);
  assert.match(html, /个频道/);
});

test("homepage archive stats keep their loading skeleton", () => {
  const html = renderToStaticMarkup(createElement(HomepageHero, {
    stats: null,
    branding,
    loading: true,
  }));

  assert.doesNotMatch(html, /<number-flow-react>/);
  assert.match(html, /animate-pulse/);
});
