import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DiscoverySpotlight from "../src/components/home/DiscoverySpotlight";
import type { HomepageData, PublicMessage } from "../src/lib/messages";

function featuredMessage(id: string): PublicMessage {
  return {
    id,
    channelId: "channel-1",
    telegramMessageId: Number(id.replace(/\D/g, "")) || 1,
    sourceUrl: "https://t.me/geekshare/1",
    date: "2026-08-25",
    datetime: "2026-08-25T10:00:00+08:00",
    from: "极客分享",
    text: `精选内容 ${id}`,
    plainText: `精选内容 ${id}`,
    title: `精选内容 ${id}`,
    summary: `这是精选内容 ${id} 的摘要。`,
    tags: ["精选"],
    media: null,
    mediaItems: [],
    replyTo: null,
    reactions: null,
    archiveStatus: "none",
    isFeatured: true,
    featuredOrder: 0,
    engagementScore: 10,
    channel: { title: "极客分享", username: "geekshare" },
  };
}

function homepage(featuredMessages: PublicMessage[]): HomepageData {
  return {
    channels: [],
    stats: { channelCount: 9, tagCount: 678, messageCount: 12_345 },
    featuredMessages,
    trendingMessages: [],
    hotTopics: [],
    recentMedia: [],
  };
}

test("featured carousel renders controls and archive stats", () => {
  const html = renderToStaticMarkup(createElement(DiscoverySpotlight, {
    data: homepage([featuredMessage("1"), featuredMessage("2"), featuredMessage("3")]),
    loading: false,
  }));

  assert.equal(html.match(/<number-flow-react>/g)?.length, 3);
  assert.match(html, /aria-label="编辑精选"/);
  assert.match(html, /aria-label="归档规模"/);
  assert.match(html, />频道</);
  assert.match(html, />标签</);
  assert.match(html, />内容</);
  assert.match(html, /aria-label="上一条精选"/);
  assert.match(html, /aria-label="下一条精选"/);
  assert.match(html, /aria-label="暂停自动轮播"/);
  assert.equal(html.match(/aria-label="查看第 [123] 条精选"/g)?.length, 3);
});

test("single featured item hides carousel controls", () => {
  const html = renderToStaticMarkup(createElement(DiscoverySpotlight, {
    data: homepage([featuredMessage("1")]),
    loading: false,
  }));

  assert.doesNotMatch(html, /上一条精选|下一条精选|暂停自动轮播|继续自动轮播/);
});

test("featured carousel keeps loading and empty states", () => {
  const loadingHtml = renderToStaticMarkup(createElement(DiscoverySpotlight, { data: null, loading: true }));
  const emptyHtml = renderToStaticMarkup(createElement(DiscoverySpotlight, { data: homepage([]), loading: false }));

  assert.match(loadingHtml, /animate-pulse/);
  assert.match(emptyHtml, /暂无编辑精选/);
  assert.equal(emptyHtml.match(/<number-flow-react>/g)?.length, 3);
});
