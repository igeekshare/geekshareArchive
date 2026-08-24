"use client";

import { ArrowRight, Flame, Sparkles } from "lucide-react";
import type { HomepageData, PublicMessage } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

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
  if (loading) return <Skeleton className="h-[260px] w-full rounded-2xl sm:h-[300px]" />;
  const featured = data?.featuredMessages[0];
  const hot = data?.trendingMessages.slice(0, 4) ?? [];
  if (!featured && hot.length === 0) return null;

  return (
    <section className="grid overflow-hidden rounded-2xl border bg-card lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]" aria-label="内容发现">
      {featured ? (
        <a
          href={messageHref(featured)}
          onClick={onOpenMessage}
          className="group relative flex min-h-[245px] flex-col justify-end overflow-hidden bg-slate-950 p-5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-[300px] sm:p-7"
        >
          {(() => {
            const media = featured.mediaItems[0] ?? featured.media;
            const image = media?.thumb || (media?.type === "photo" ? media.url : undefined);
            return image ? <img src={image} alt="" className="absolute inset-0 size-full object-cover opacity-35 transition duration-500 group-hover:scale-[1.02]" /> : null;
          })()}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/10" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-100 backdrop-blur"><Sparkles className="size-3.5 text-red-400" />编辑精选</span>
            <h2 className="mt-3 text-balance text-[1.35rem] font-extrabold leading-[1.28] tracking-[-0.02em] sm:text-[1.75rem]">{featured.title}</h2>
            {featured.summary.trim() !== featured.title.trim() && <p className="mt-2 line-clamp-2 max-w-[62ch] text-sm leading-6 text-slate-300">{featured.summary}</p>}
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white">阅读全文<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
          </div>
        </a>
      ) : <div className="hidden lg:block" />}

      <div className="border-t p-4 lg:border-l lg:border-t-0 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold"><Flame className="size-4 text-primary" />本周热门</h2>
          <span className="text-xs text-muted-foreground">近 7 天</span>
        </div>
        <ol className="mt-2 divide-y">
          {hot.map((message, index) => (
            <li key={message.id}>
              <a href={messageHref(message)} onClick={onOpenMessage} className="group grid grid-cols-[24px_minmax(0,1fr)] gap-2.5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className={cn("pt-0.5 text-sm font-black tabular-nums text-muted-foreground/45", index === 0 && "text-primary")}>{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <strong className="line-clamp-2 text-sm leading-5 transition group-hover:text-blue-600 dark:group-hover:text-blue-300">{message.title}</strong>
                  <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground"><span className="truncate">{message.channel.title}</span><span aria-hidden="true">·</span><time>{shortDate(message.datetime ?? message.date)}</time></span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
