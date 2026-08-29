"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import MessageCard from "@/components/MessageCard";
import ArchiveToolbar from "@/components/home/ArchiveToolbar";
import DiscoverySpotlight from "@/components/home/DiscoverySpotlight";
import { ChannelStrip, SidebarModules } from "@/components/home/HomepageSidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ArchiveMeta, HomepageData, MessageCategory, MessageListResponse, MessageSort, PublicMessage } from "@/lib/messages";
import { DEFAULT_PUBLIC_SITE_CONFIG, type PublicSiteConfig } from "@/lib/site-config";
import { visiblePageNumbers } from "@/lib/utils";

const categories: MessageCategory[] = ["all", "visual", "link", "interactive", "file"];
const sorts: MessageSort[] = ["newest", "oldest", "featured", "hot"];
const RESTORE_KEY = "geekshare:feed-position";

type RestoreState = { search: string; scrollY: number };

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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
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
  const pageParam = searchParams.get("page");
  const requestedPage = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
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
    const params = new URLSearchParams({ category, sort, limit: "10" });
    if (requestedPage > 1) params.set("page", String(requestedPage));
    if (query) params.set("q", query);
    if (activeTag) params.set("tag", activeTag);
    if (activeYear) params.set("year", activeYear);
    if (activeMonth) params.set("month", activeMonth);
    if (activeChannel) params.set("channel", activeChannel);
    return params;
  }, [activeChannel, activeMonth, activeTag, activeYear, category, query, requestedPage, sort]);

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
        setCurrentPage(data.page);
        setTotalPages(data.totalPages);
        const canonicalPageParam = data.page > 1 ? String(data.page) : null;
        if (pageParam !== canonicalPageParam) {
          const next = new URLSearchParams(filterKey);
          if (canonicalPageParam) next.set("page", canonicalPageParam);
          else next.delete("page");
          const suffix = next.toString();
          router.replace(suffix ? `/?${suffix}` : "/", { scroll: false });
        }
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
  }, [buildParams, filterKey, pageParam, restoreState, router]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 520);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const rememberPosition = useCallback(() => {
    sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ search: window.location.search, scrollY: window.scrollY } satisfies RestoreState));
  }, []);

  const scrollToFeed = useCallback(() => {
    const y = (feedRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - (window.innerWidth < 768 ? 176 : 120);
    window.scrollTo({ top: Math.max(0, y), behavior: preferredScrollBehavior() });
  }, []);

  const changePage = useCallback((page: number) => {
    if (page === currentPage) return;
    const next = new URLSearchParams(searchParams.toString());
    if (page > 1) next.set("page", String(page));
    else next.delete("page");
    const suffix = next.toString();
    router.push(suffix ? `/?${suffix}` : "/", { scroll: false });
    window.setTimeout(scrollToFeed, 40);
  }, [currentPage, router, scrollToFeed, searchParams]);

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

  const clearAll = () => updateParams({ q: null, tag: null, year: null, month: null, channel: null, category: null, sort: null });
  const filtersActive = !discoveryVisible;
  const telegramUrl = homepage?.channels.find((channel) => channel.enabled)?.telegramUrl ?? homepage?.channels[0]?.telegramUrl;
  const pageNumbers = visiblePageNumbers(currentPage, totalPages);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_50%_-15%,rgba(59,130,246,0.06),transparent_30%)]">
      <SiteHeader searchValue={searchQuery} onSearchChange={setSearchQuery} onSearchSubmit={(value) => updateParams({ q: value.trim() })} branding={siteConfig.branding} telegramUrl={telegramUrl} />

      <main className="mx-auto max-w-[1120px] px-4 pb-20 pt-3 sm:pt-5">
        <h1 className="sr-only">{siteConfig.branding.siteName}归档</h1>
        <div className="space-y-3 sm:space-y-4">
          <div id="channel"><ChannelStrip data={homepage} loading={homepageLoading} activeChannel={activeChannel} onChannelChange={(channelId) => updateParams({ channel: channelId })} /></div>
          {discoveryVisible && <DiscoverySpotlight data={homepage} loading={homepageLoading} onOpenMessage={rememberPosition} />}
        </div>

        <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section id="feed" ref={feedRef} className="min-w-0 min-h-[60vh] scroll-mt-40 md:scroll-mt-28" aria-label="最新内容">
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

            {filtersActive && <div className="mb-3 flex justify-end px-1"><Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground"><X />清除条件</Button></div>}

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

            {!loading && messages.length > 0 && totalPages > 1 && (
              <nav aria-label="内容分页" className="mt-6 flex items-center justify-center gap-1">
                <Button variant="outline" size="icon" aria-label="上一页" disabled={currentPage <= 1} onClick={() => changePage(currentPage - 1)}><ChevronLeft /></Button>
                {pageNumbers.map((page) => (
                  <Button
                    key={page}
                    variant={page === currentPage ? "default" : "outline"}
                    size="icon"
                    aria-label={`第 ${page} 页`}
                    aria-current={page === currentPage ? "page" : undefined}
                    className="tabular-nums"
                    onClick={() => changePage(page)}
                  >
                    {page}
                  </Button>
                ))}
                <Button variant="outline" size="icon" aria-label="下一页" disabled={currentPage >= totalPages} onClick={() => changePage(currentPage + 1)}><ChevronRight /></Button>
              </nav>
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
