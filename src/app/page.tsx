"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import messagesData from "@/data/messages.json";
import MessageCard from "@/components/MessageCard";

import {
  Search,
  Hash,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  X,
  Calendar,
} from "lucide-react";

// 定义消息类型
interface Reaction {
  emoji: string;
  count: string;
}

interface Media {
  type: "photo" | "video" | "file";
  url: string;
  thumb?: string;
  width?: string;
  height?: string;
  title?: string;
  description?: string;
}

interface Message {
  id: string;
  date: string;
  from: string;
  text: string;
  media?: Media | null;
  replyTo?: string | null;
  reactions?: Reaction[] | null;
}

const ITEMS_PER_PAGE = 30;

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeYear, setActiveYear] = useState<string | null>(null);
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isScrolled, setIsScrolled] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [listOffset, setListOffset] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // 反转数组记录，优先展示最新消息
  const allMessages = useMemo(() => {
    return [...(messagesData as Message[])].reverse();
  }, []);

  // 1. 自动提取所有标签
  const allTags = useMemo(() => {
    const tagCountMap: Record<string, number> = {};
    allMessages.forEach((msg) => {
      if (msg.text) {
        const regex = /#([A-Za-z0-9_\u4e00-\u9fa5]+)/g;
        let match;
        while ((match = regex.exec(msg.text)) !== null) {
          const tag = match[1].trim();
          if (tag) {
            tagCountMap[tag] = (tagCountMap[tag] || 0) + 1;
          }
        }
      }
    });
    return Object.entries(tagCountMap)
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [allMessages]);

  // 1.5 提取时间选项
  const timeOptions = useMemo(() => {
    const years = new Set<string>();
    const monthsByYear: Record<string, Set<string>> = {};
    allMessages.forEach((msg) => {
      try {
        const datePart = msg.date.split(" ")[0];
        const parts = datePart.split(".");
        const m = parts[1];
        const y = parts[2];
        if (y && m) {
          years.add(y);
          if (!monthsByYear[y]) monthsByYear[y] = new Set();
          monthsByYear[y].add(m);
        }
      } catch (e) {}
    });
    return {
      years: Array.from(years).sort((a, b) => b.localeCompare(a)),
      monthsByYear,
    };
  }, [allMessages]);

  // 2. 搜索与复合过滤逻辑
  const filteredMessages = useMemo(() => {
    return allMessages.filter((msg) => {
      // 时间过滤
      if (activeYear || activeMonth) {
        const parts = msg.date.split(" ")[0].split(".");
        const msgMonth = parts[1];
        const msgYear = parts[2];
        if (activeYear && msgYear !== activeYear) return false;
        if (activeMonth && msgMonth !== activeMonth) return false;
      }
      // 标签过滤
      if (activeTag) {
        const tagRegex = new RegExp(
          `#${activeTag}(?![A-Za-z0-9_\\u4e00-\\u9fa5])`,
          "i",
        );
        if (!msg.text || !tagRegex.test(msg.text)) return false;
      }
      // 文本搜索
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const textMatch = msg.text?.toLowerCase().includes(query);
        const idMatch = msg.id?.toLowerCase().includes(query);
        const mediaMatch =
          msg.media?.title?.toLowerCase().includes(query) ||
          msg.media?.description?.toLowerCase().includes(query);
        if (!(textMatch || idMatch || mediaMatch)) return false;
      }
      return true;
    });
  }, [searchQuery, activeTag, activeYear, activeMonth, allMessages]);

  // 分页逻辑
  const totalPages = Math.ceil(filteredMessages.length / ITEMS_PER_PAGE);
  const paginatedMessages = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredMessages.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredMessages, currentPage]);

  // 映射用于页内跳转
  const idToIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    paginatedMessages.forEach((msg, index) => {
      map.set(msg.id, index);
    });
    return map;
  }, [paginatedMessages]);

  // 维护列表的顶部偏移量供虚拟化使用，防止滚动时因动态测量导致严重抖动
  useEffect(() => {
    const updateOffset = () => {
      if (listRef.current) {
        setListOffset(listRef.current.offsetTop);
      }
    };
    updateOffset();
    // 监听可能改变顶部高度的事件（如窗口调整）
    window.addEventListener("resize", updateOffset);
    return () => window.removeEventListener("resize", updateOffset);
  }, [showFilters, activeTag, activeYear, activeMonth, searchQuery]);

  // 虚拟化
  const virtualizer = useWindowVirtualizer({
    count: paginatedMessages.length,
    estimateSize: () => 250,
    overscan: 5,
    scrollMargin: listOffset,
  });

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 统一滚动至列表顶端（考虑粘性头部高度）
  const scrollToListTop = useCallback((smooth = false) => {
    const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0;
    const listTop = listRef.current?.getBoundingClientRect().top ?? 0;
    const absoluteY = window.scrollY + listTop;
    const targetY = Math.max(0, absoluteY - headerHeight - 16);

    // 虚拟列表长距离分页跳转时必须禁用 smooth，否则与测量的动态高度冲突会导致严重抖动
    window.scrollTo({ top: targetY, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
    scrollToListTop(false);
  };

  const toggleTag = useCallback(
    (tag: string) => {
      setActiveTag((prev) => (prev === tag ? null : tag));
      setCurrentPage(1);
      scrollToListTop(false);
    },
    [scrollToListTop],
  );

  const goToPage = (page: number) => {
    const newPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(newPage);
  };

  // 在页码/列表长度变化后滚动至顶端
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      scrollToListTop(false);
      // 双保险：确保虚拟列表在新页码完成渲染并撑开高度后，再次精确滚到正确位置
      setTimeout(() => scrollToListTop(false), 50);
    });
    return () => cancelAnimationFrame(id);
  }, [currentPage, filteredMessages.length, scrollToListTop]);

  const handleScrollToReply = useCallback(
    (replyId: string) => {
      const targetIndex = idToIndexMap.get(replyId);
      if (targetIndex !== undefined) {
        virtualizer.scrollToIndex(targetIndex, { align: "center" });
        setHighlightId(replyId);
        setTimeout(() => setHighlightId(null), 2000);
      } else {
        alert("该消息不在当前页面，请尝试搜索或翻页。");
      }
    },
    [idToIndexMap, virtualizer],
  );

  const clearAllFilters = () => {
    setSearchQuery("");
    setActiveTag(null);
    setActiveYear(null);
    setActiveMonth(null);
    setCurrentPage(1);
  };

  const isFilterActive = activeTag || activeYear || activeMonth;

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto pb-12">
      {/* 顶部极简导航 */}
      <header
        ref={headerRef}
        className="sticky top-0 z-30 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl pt-6 pb-4 border border-gray-200 dark:border-zinc-800 rounded-2xl flex flex-col gap-4 px-2"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <a
              href="https://t.me/xgeekshare"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <img
                src="/favicon.svg"
                alt=""
                className="w-7 h-7 md:w-8 md:h-8 rounded-full"
              />

              <h1 className="text-2xl md:text-3xl font-extrabold text-[#fe4844]">
                极客分享
              </h1>
            </a>

            <span className="hidden sm:inline-block text-[11px] font-bold bg-zinc-100/60 dark:bg-zinc-800/60 px-2 py-0.5 rounded-full text-zinc-700 dark:text-zinc-300 uppercase tracking-tighter">
              Archive
            </span>
          </div>
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {allMessages.length} 条记录
          </p>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1 group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder="搜索关键词、链接或 ID..."
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-100/80 dark:bg-zinc-800/50 border border-transparent focus:border-blue-500/30 focus:bg-white dark:focus:bg-zinc-900 rounded-xl text-sm outline-none ring-4 ring-transparent focus:ring-blue-500/5 transition-all"
              value={searchQuery}
              onChange={handleSearch}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setCurrentPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full text-zinc-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 flex items-center gap-2 rounded-xl border transition-all ${
              showFilters || isFilterActive
                ? "bg-blue-500 border-blue-500 text-white"
                : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            }`}
          >
            <Filter
              className={`w-4 h-4 ${isFilterActive && !showFilters ? "animate-pulse" : ""}`}
            />
            <span className="hidden sm:inline text-sm font-semibold">筛选</span>
            {isFilterActive && (
              <span className="w-2 h-2 rounded-full bg-white animate-bounce" />
            )}
          </button>
        </div>

        {/* 可折叠筛选面板 */}
        {showFilters && (
          <div className="flex flex-col gap-5 pt-4 pb-2 px-1 border-t border-zinc-100 dark:border-zinc-800/50 animate-in slide-in-from-top-2 duration-200">
            {/* 标签 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-zinc-400">
                <Hash className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  话题标签
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto custom-scrollbar pr-2">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                      activeTag === tag
                        ? "bg-zinc-900 dark:bg白 text-white dark:text-black shadow-md".replace(
                            "白",
                            "white",
                          )
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* 时间 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-zinc-400">
                <Calendar className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  时间范围
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {/* 年份 */}
                <div className="flex flex-wrap gap-1.5">
                  {timeOptions.years.map((year) => (
                    <button
                      key={year}
                      onClick={() => {
                        setActiveYear(activeYear === year ? null : year);
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
                        activeYear === year
                          ? "bg-blue-500 text-white shadow-sm"
                          : "bg-zinc-100 dark:bg-zinc-800/50 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
                {/* 月份 */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "01",
                    "02",
                    "03",
                    "04",
                    "05",
                    "06",
                    "07",
                    "08",
                    "09",
                    "10",
                    "11",
                    "12",
                  ].map((month) => {
                    const hasData = activeYear
                      ? timeOptions.monthsByYear[activeYear]?.has(month)
                      : Object.values(timeOptions.monthsByYear).some((s) =>
                          s.has(month),
                        );
                    if (!hasData) return null;
                    return (
                      <button
                        key={month}
                        onClick={() => {
                          setActiveMonth(activeMonth === month ? null : month);
                          setCurrentPage(1);
                        }}
                        className={`px-2 py-1 rounded-lg text-xs font-mono transition-all ${
                          activeMonth === month
                            ? "bg-blue-500 text-white shadow-sm"
                            : "bg-zinc-100 dark:bg-zinc-800/50 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {month}月
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {isFilterActive && (
              <button
                onClick={clearAllFilters}
                className="w-full py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-xs font-bold rounded-lg hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 transition-colors"
              >
                重置所有筛选条件
              </button>
            )}
          </div>
        )}
      </header>

      {/* 状态提示 */}
      {(searchQuery || isFilterActive) && (
        <div className="flex items-center justify-between px-3 text-sm text-zinc-500 font-medium">
          <span className="truncate pr-4">
            找到 {filteredMessages.length} 条关于 "
            <span className="text-zinc-900 dark:text-zinc-100">
              {[
                activeYear ? `${activeYear}年` : "",
                activeMonth ? `${activeMonth}月` : "",
                activeTag ? `#${activeTag}` : "",
                searchQuery ? `"${searchQuery}"` : "",
              ]
                .filter(Boolean)
                .join(" ")}
            </span>
            " 的内容
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-mono text-zinc-400 whitespace-nowrap">
              {currentPage}/{totalPages}页
            </span>
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div
        ref={listRef}
        className="px-2 min-h-[60vh] [overflow-anchor:none] [&_span.text-blue-700]:cursor-pointer"
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (
            target.tagName === "SPAN" &&
            target.textContent?.trim().startsWith("#")
          ) {
            const tag = target.textContent.trim().substring(1);
            if (tag) {
              toggleTag(tag);
              if (!showFilters) setShowFilters(true);
            }
          }
        }}
      >
        {paginatedMessages.length > 0 ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const msg = paginatedMessages[virtualRow.index];
              if (!msg) return null;
              return (
                <div
                  key={msg.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                  }}
                >
                  <div
                    className={`pb-5 transition-all duration-500 ${
                      highlightId === msg.id
                        ? "ring-2 ring-blue-400 ring-offset-4 dark:ring-offset-black rounded-2xl scale-[1.01]"
                        : ""
                    }`}
                  >
                    <MessageCard
                      id={msg.id}
                      date={msg.date}
                      from={msg.from}
                      text={msg.text}
                      media={msg.media}
                      replyTo={msg.replyTo}
                      reactions={msg.reactions}
                      onScrollToReply={handleScrollToReply}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-32 flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
              <Search className="w-6 h-6 text-zinc-400" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              未找到结果
            </h3>
          </div>
        )}
      </div>

      {/* 分页控制器 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-8 pb-24">
          <button
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
          >
            <ChevronsLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center px-4">
            <span className="text-sm font-bold bg-zinc-900 dark:bg-white text-white dark:text-black px-4 py-1.5 rounded-lg shadow-lg">
              {currentPage}
            </span>
          </div>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
          >
            <ChevronsRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* 回到顶部 */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-8 right-8 p-3.5 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-2xl shadow-xl hover:-translate-y-1 transition-all z-[60] ${
          isScrolled ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
      >
        <ArrowUp className="w-5 h-5 stroke-2" />
      </button>

      <style
        dangerouslySetInnerHTML={{
          __html: `.custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.3); border-radius: 10px; }`,
        }}
      />
    </div>
  );
}
