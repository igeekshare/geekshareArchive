"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, LoaderCircle, Search, X } from "lucide-react";
import AnimatedNumber from "@/components/AnimatedNumber";
import SiteHeader from "@/components/SiteHeader";
import MessageCard from "@/components/MessageCard";
import ArchiveToolbar from "@/components/home/ArchiveToolbar";
import DiscoverySpotlight from "@/components/home/DiscoverySpotlight";
import HomepageHero from "@/components/home/HomepageHero";
import { ChannelStrip, SidebarModules } from "@/components/home/HomepageSidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ArchiveMeta, HomepageData, MessageCategory, MessageListResponse, MessageSort, PublicMessage } from "@/lib/messages";
import { DEFAULT_PUBLIC_SITE_CONFIG, type PublicSiteConfig } from "@/lib/site-config";

const categories: MessageCategory[] = ["all", "visual", "link", "interactive", "file"];
const sorts: MessageSort[] = ["newest", "oldest", "featured", "hot"];
const RESTORE_KEY = "geekshare:feed-position";

type RestoreState = { search: string; scrollY: number; loadedCount: number };

function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function paramCategory(value: string | null): MessageCategory {
  return categories.includes(value as MessageCategory) ? (value as MessageCategory) : "all";
}

function paramSort(value: string | null): MessageSort {
  return sorts.includes(value as MessageSort) ? (value as MessageSort) : "newest";
}

function readRestoreState(): RestoreState | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(RESTORE_KEY) ?? "null") as RestoreState | null;
    return parsed?.search === window.location.search ? parsed : null;
  } catch {
    return null;
  }
}

export default function ArchivePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [restoreState] = useState(readRestoreState);
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [meta, setMeta] = useState<ArchiveMeta>({ tags: [], years: [], monthsByYear: {} });
  const [homepage, setHomepage] = useState<HomepageData | null>(null);
  const [siteConfig, setSiteConfig] = useState<PublicSiteConfig>(DEFAULT_PUBLIC_SITE_CONFIG);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoadedMessages, setHasLoadedMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [homepageLoading, setHomepageLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");
  const [isScrolled, setIsScrolled] = useState(false);
  const feedRef = useRef<HTMLElement>(null);
  const restoredRef = useRef(false);

  const query = searchParams.get("q") ?? "";
  const activeTag = searchParams.get("tag");
  const activeYear = searchParams.get("year");
  const activeMonth = searchParams.get("month");
  const activeChannel = searchParams.get("channel");
  const category = paramCategory(searchParams.get("category"));
  const sort = paramSort(searchParams.get("sort"));
  const legacyPage = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const filterKey = searchParams.toString();
  const discoveryVisible = !query && !activeTag && !activeYear && !activeMonth && !activeChannel && category === "all" && sort === "newest";

  const updateParams = useCallback((values: Record<string, string | number | null | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === undefined || value === "" || (key === "category" && value === "all") || (key === "sort" && value === "newest")) next.delete(key);
      else next.set(key, String(value));
    }
    next.delete("page");
    const suffix = next.toString();
    router.replace(suffix ? `/?${suffix}` : "/", { scroll: false });
  }, [router, searchParams]);

  useEffect(() => setSearchQuery(query), [query]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (searchQuery.trim() !== query) updateParams({ q: searchQuery.trim() });
    }, 280);
    return () => window.clearTimeout(timeout);
  }, [query, searchQuery, updateParams]);

  useEffect(() => {
    Promise.allSettled([
      fetch("/api/archive-meta", { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<ArchiveMeta> : Promise.reject()).then(setMeta),
      fetch("/api/homepage", { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<HomepageData> : Promise.reject()).then(setHomepage).finally(() => setHomepageLoading(false)),
      fetch("/api/site-config", { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<PublicSiteConfig> : Promise.reject()).then(setSiteConfig),
    ]).then((results) => {
      if (results[0]?.status === "rejected") setMeta({ tags: [], years: [], monthsByYear: {} });
      if (results[1]?.status === "rejected") setHomepage(null);
    });
  }, []);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams({ category, sort, limit: String(Math.min(60, Math.max(30, restoreState?.loadedCount ?? 30))) });
    if (legacyPage > 1) params.set("page", String(legacyPage));
    if (query) params.set("q", query);
    if (activeTag) params.set("tag", activeTag);
    if (activeYear) params.set("year", activeYear);
    if (activeMonth) params.set("month", activeMonth);
    if (activeChannel) params.set("channel", activeChannel);
    return params;
  }, [activeChannel, activeMonth, activeTag, activeYear, category, legacyPage, query, restoreState?.loadedCount, sort]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    fetch(`/api/messages?${buildParams()}`, { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("messages request failed");
        return response.json() as Promise<MessageListResponse>;
      })
      .then((data) => {
        setMessages(data.items);
        setTotal(data.total);
        setNextCursor(data.nextCursor);
        setHasLoadedMessages(true);
        if (restoreState && !restoredRef.current) {
          restoredRef.current = true;
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.scrollTo({ top: restoreState.scrollY, behavior: "auto" })));
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError("无法加载内容，请稍后重试。");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [buildParams, filterKey, restoreState]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 520);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const rememberPosition = useCallback(() => {
    sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ search: window.location.search, scrollY: window.scrollY, loadedCount: messages.length } satisfies RestoreState));
  }, [messages.length]);

  const scrollToFeed = useCallback(() => {
    const y = (feedRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - (window.innerWidth < 768 ? 176 : 120);
    window.scrollTo({ top: Math.max(0, y), behavior: preferredScrollBehavior() });
  }, []);

  const selectTag = useCallback((tag: string) => {
    updateParams({ tag: activeTag === tag ? null : tag });
    window.setTimeout(scrollToFeed, 40);
  }, [activeTag, scrollToFeed, updateParams]);

  const messageIds = useMemo(() => new Set(messages.map((message) => message.id)), [messages]);
  const handleScrollToReply = useCallback((replyId: string) => {
    if (!messageIds.has(replyId)) {
      rememberPosition();
      window.location.assign(`/message/${encodeURIComponent(replyId)}`);
      return;
    }
    document.getElementById(replyId)?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "center" });
  }, [messageIds, rememberPosition]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = buildParams();
      params.delete("page");
      params.set("limit", "30");
      params.set("cursor", nextCursor);
      const response = await fetch(`/api/messages?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load more failed");
      const data = await response.json() as MessageListResponse;
      setMessages((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...data.items.filter((item) => !known.has(item.id))];
      });
      setNextCursor(data.nextCursor);
    } catch {
      setLoadError("加载更多失败，请稍后重试。");
    } finally {
      setLoadingMore(false);
    }
  };

  const clearAll = () => updateParams({ q: null, tag: null, year: null, month: null, channel: null, category: null, sort: null });
  const filtersActive = !discoveryVisible;
  const telegramUrl = homepage?.channels.find((channel) => channel.enabled)?.telegramUrl ?? homepage?.channels[0]?.telegramUrl;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_50%_-15%,rgba(59,130,246,0.06),transparent_30%)]">
      <SiteHeader searchValue={searchQuery} onSearchChange={setSearchQuery} onSearchSubmit={(value) => updateParams({ q: value.trim() })} branding={siteConfig.branding} telegramUrl={telegramUrl} />

      <main className="mx-auto max-w-[1276px] px-4 pb-20 pt-3 sm:pt-5 min-[1300px]:px-0">
        <div className="space-y-3 sm:space-y-4">
          <HomepageHero stats={homepage?.stats ?? null} branding={siteConfig.branding} loading={homepageLoading} />
          <div id="channel"><ChannelStrip data={homepage} loading={homepageLoading} activeChannel={activeChannel} onChannelChange={(channelId) => updateParams({ channel: channelId })} /></div>
          {discoveryVisible && <DiscoverySpotlight data={homepage} loading={homepageLoading} onOpenMessage={rememberPosition} />}
        </div>

        <div className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-7">
          <section id="feed" ref={feedRef} className="min-h-[60vh] scroll-mt-40 md:scroll-mt-28" aria-label="最新内容">
            <div className="sticky top-[116px] z-40 -mx-1 bg-background/92 px-1 py-2 backdrop-blur md:top-[60px]">
              <ArchiveToolbar
                category={category} sort={sort} tags={meta.tags} years={meta.years} monthsByYear={meta.monthsByYear}
                activeTag={activeTag} activeYear={activeYear} activeMonth={activeMonth}
                onCategoryChange={(value) => updateParams({ category: value })}
                onSortChange={(value) => updateParams({ sort: value })}
                onTagChange={(value) => updateParams({ tag: value })}
                onYearChange={(value) => updateParams({ year: value, month: null })}
                onMonthChange={(value) => updateParams({ month: value })}
                onReset={() => updateParams({ tag: null, year: null, month: null })}
              />
            </div>

            <div className="mb-3 flex min-h-8 items-end justify-between gap-3 px-1">
              <div>
                <h2 className="text-lg font-extrabold">{sort === "hot" ? "本周热门" : sort === "featured" ? "编辑精选" : sort === "oldest" ? "从最早开始" : "最新内容"}</h2>
                {hasLoadedMessages ? (
                  <p className={`mt-0.5 text-xs text-muted-foreground transition-opacity motion-reduce:transition-none ${loading ? "opacity-55" : "opacity-100"}`} aria-busy={loading} aria-live="polite">
                    共 <AnimatedNumber value={total} /> 条内容
                  </p>
                ) : loading ? (
                  <Skeleton className="mt-1 h-3 w-20" />
                ) : null}
              </div>
              {filtersActive && <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground"><X />清除条件</Button>}
            </div>

            {loadError && messages.length === 0 ? (
              <div className="rounded-xl border bg-card py-24 text-center text-sm text-destructive">{loadError}</div>
            ) : loading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-56 w-full rounded-xl" />)}</div>
            ) : messages.length ? (
              <div key={filterKey} className="space-y-3 motion-safe:animate-in motion-safe:fade-in motion-safe:[animation-duration:180ms]">
                {messages.map((message) => <MessageCard key={message.id} message={message} onScrollToReply={handleScrollToReply} onTagClick={selectTag} onOpenDetail={rememberPosition} />)}
              </div>
            ) : (
              <div key={filterKey} className="rounded-xl border bg-card py-24 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:[animation-duration:180ms]">
                <Search className="mx-auto size-8 text-muted-foreground/50" />
                <h2 className="mt-3 text-base font-bold">没有找到匹配内容</h2>
                <p className="mt-1 text-sm text-muted-foreground">换个关键词，或清除当前筛选条件。</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={clearAll}>查看全部内容</Button>
              </div>
            )}

            {messages.length > 0 && nextCursor && (
              <div className="mt-5 flex justify-center">
                <Button variant="outline" className="min-w-36" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? <><LoaderCircle className="animate-spin" />加载中</> : "加载更多"}</Button>
              </div>
            )}
            {loadError && messages.length > 0 && <p className="mt-3 text-center text-sm text-destructive">{loadError}</p>}
          </section>

          <div id="topics" className="hidden lg:sticky lg:top-[76px] lg:block"><SidebarModules data={homepage} loading={homepageLoading} onTagClick={selectTag} onOpenMessage={rememberPosition} /></div>
        </div>
      </main>

      <Button variant="secondary" size="icon" aria-label="返回顶部" className={`fixed bottom-6 right-6 z-40 rounded-xl border shadow-lg transition-all motion-reduce:transition-none ${isScrolled ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`} onClick={() => window.scrollTo({ top: 0, behavior: preferredScrollBehavior() })}><ArrowUp /></Button>
    </div>
  );
}
