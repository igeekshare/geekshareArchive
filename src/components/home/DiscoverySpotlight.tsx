"use client";

import { useEffect, useState } from "react";
import { Archive, ArrowRight, ChevronLeft, ChevronRight, Flame, Hash, Pause, Play, RadioTower, Sparkles } from "lucide-react";
import AnimatedNumber from "@/components/AnimatedNumber";
import type { HomepageData, PublicMessage } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const AUTOPLAY_DELAY = 5_000;

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "short", day: "numeric" }).format(date);
}

function messageHref(message: PublicMessage) {
  return `/message/${encodeURIComponent(message.id)}`;
}

export default function DiscoverySpotlight({ data, loading, onOpenMessage }: {
  data: HomepageData | null;
  loading: boolean;
  onOpenMessage?: () => void;
}) {
  const featured = data?.featuredMessages ?? [];
  const hot = data?.trendingMessages.slice(0, 4) ?? [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const current = featured[activeIndex] ?? featured[0];
  const hasMultiple = featured.length > 1;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (activeIndex >= featured.length) setActiveIndex(0);
  }, [activeIndex, featured.length]);

  useEffect(() => {
    if (!hasMultiple || manuallyPaused || interactionPaused || reduceMotion) return;
    const timeout = window.setTimeout(() => setActiveIndex((index) => (index + 1) % featured.length), AUTOPLAY_DELAY);
    return () => window.clearTimeout(timeout);
  }, [activeIndex, featured.length, hasMultiple, interactionPaused, manuallyPaused, reduceMotion]);

  if (loading) return <Skeleton className="h-[360px] w-full rounded-2xl lg:h-[380px]" />;

  const show = (index: number) => setActiveIndex((index + featured.length) % featured.length);
  const stats = [
    { label: "频道", value: data?.stats.channelCount ?? 0, icon: RadioTower, color: "text-blue-400" },
    { label: "标签", value: data?.stats.tagCount ?? 0, icon: Hash, color: "text-red-400" },
    { label: "内容", value: data?.stats.messageCount ?? 0, icon: Archive, color: "text-blue-400" },
  ];

  return (
    <section className="grid overflow-hidden rounded-2xl border bg-card lg:h-[380px] lg:grid-cols-[360px_minmax(0,1fr)]" aria-label="内容发现">
      <div
        className="flex h-[360px] min-w-0 flex-col bg-slate-950 text-white lg:h-full"
        role="region"
        aria-roledescription="轮播"
        aria-label="编辑精选"
        onMouseEnter={() => setInteractionPaused(true)}
        onMouseLeave={() => setInteractionPaused(false)}
        onFocusCapture={() => setInteractionPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInteractionPaused(false);
        }}
      >
        <div className="relative min-h-0 flex-1 overflow-hidden" aria-live={manuallyPaused || interactionPaused || reduceMotion ? "polite" : "off"} aria-atomic="true">
          {current ? (
            <div
              key={current.id}
              className="size-full"
              role="group"
              aria-roledescription="幻灯片"
              aria-label={`${activeIndex + 1} / ${featured.length}：${current.title}`}
            >
              <a
                href={messageHref(current)}
                onClick={onOpenMessage}
                className="group relative flex size-full flex-col justify-end overflow-hidden p-5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-safe:animate-in motion-safe:fade-in motion-safe:[animation-duration:240ms] sm:p-6"
              >
                {(() => {
                  const media = current.mediaItems[0] ?? current.media;
                  const image = media?.thumb || (media?.type === "photo" ? media.url : undefined);
                  return image ? <img src={image} alt="" className="absolute inset-0 size-full object-cover opacity-35 transition duration-500 group-hover:scale-[1.02] motion-reduce:transition-none" /> : null;
                })()}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-950/15" aria-hidden="true" />
                <div className="relative max-w-[29rem]">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-100 backdrop-blur"><Sparkles className="size-3.5 text-red-400" />编辑精选</span>
                  <h2 className="mt-3 line-clamp-3 text-balance text-xl font-extrabold leading-[1.28] tracking-[-0.02em]">{current.title}</h2>
                  {current.summary.trim() !== current.title.trim() && <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-300">{current.summary}</p>}
                  <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white">阅读全文<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" /></span>
                </div>
              </a>
            </div>
          ) : (
            <div className="flex size-full flex-col justify-end p-6">
              <Sparkles className="size-5 text-red-400" />
              <h2 className="mt-3 text-xl font-extrabold">暂无编辑精选</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">内容设为精选后会在这里轮播展示。</p>
            </div>
          )}

          {hasMultiple && (
            <>
              <button type="button" aria-label="上一条精选" onClick={() => show(activeIndex - 1)} className="absolute left-3 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg bg-slate-950/65 text-white backdrop-blur transition hover:bg-slate-950/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"><ChevronLeft className="size-4" /></button>
              <button type="button" aria-label="下一条精选" onClick={() => show(activeIndex + 1)} className="absolute right-3 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg bg-slate-950/65 text-white backdrop-blur transition hover:bg-slate-950/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"><ChevronRight className="size-4" /></button>
              <div className="absolute right-3 top-3 z-10 flex h-8 items-center rounded-lg bg-slate-950/65 px-1 backdrop-blur">
                {featured.map((message, index) => (
                  <button key={message.id} type="button" aria-label={`查看第 ${index + 1} 条精选`} aria-current={index === activeIndex ? "true" : undefined} onClick={() => show(index)} className="flex size-7 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    <span className={cn("h-1.5 w-1.5 rounded-full bg-white/40 transition-all motion-reduce:transition-none", index === activeIndex && "w-3 bg-white")} />
                  </button>
                ))}
                {!reduceMotion && (
                  <button type="button" aria-label={manuallyPaused ? "继续自动轮播" : "暂停自动轮播"} onClick={() => setManuallyPaused((paused) => !paused)} className="flex size-7 items-center justify-center rounded-md text-white/80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none">
                    {manuallyPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="grid h-16 shrink-0 grid-cols-3 border-t border-white/10 bg-slate-950" aria-label="归档规模">
          {stats.map(({ label, value, icon: Icon, color }, index) => (
            <span key={label} className={cn("flex items-center justify-center gap-1.5 px-2 text-xs text-slate-300", index > 0 && "border-l border-white/10")}>
              <Icon className={cn("size-3.5 shrink-0", color)} />
              <strong className="text-xs font-bold tabular-nums text-white"><AnimatedNumber value={value} /></strong>
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col border-t p-4 lg:border-l lg:border-t-0 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold"><Flame className="size-4 text-primary" />本周热门</h2>
          <span className="text-xs text-muted-foreground">近 7 天</span>
        </div>
        {hot.length ? (
          <ol className="mt-2 flex flex-1 flex-col divide-y">
            {hot.map((message, index) => (
              <li key={message.id} className="flex-1">
                <a href={messageHref(message)} onClick={onOpenMessage} className="group grid h-full grid-cols-[24px_minmax(0,1fr)] content-center gap-2.5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className={cn("pt-0.5 text-sm font-black tabular-nums text-muted-foreground/45", index === 0 && "text-primary")}>{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <strong className="line-clamp-2 text-sm leading-5 transition group-hover:text-blue-600 dark:group-hover:text-blue-300">{message.title}</strong>
                    <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span className="truncate">{message.channel.title}</span><span aria-hidden="true">·</span><time>{shortDate(message.datetime ?? message.date)}</time></span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        ) : <p className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">本周暂无热门内容。</p>}
      </div>
    </section>
  );
}
