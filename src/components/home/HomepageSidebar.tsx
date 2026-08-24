"use client";

import { ExternalLink, Hash, ImageIcon, Link2, RadioTower } from "lucide-react";
import type { HomepageData } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

export function ChannelStrip({
  data,
  loading,
  activeChannel,
  onChannelChange,
}: {
  data: HomepageData | null;
  loading: boolean;
  activeChannel: string | null;
  onChannelChange: (channelId: string | null) => void;
}) {
  if (loading) return <Skeleton className="h-10 w-full rounded-xl" />;
  const channels = data?.channels ?? [];
  if (channels.length === 0) return null;

  if (channels.length === 1) {
    const channel = channels[0];
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2">
        <button
          type="button"
          onClick={() => onChannelChange(activeChannel === channel.id ? null : channel.id)}
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeChannel === channel.id && "text-blue-600 dark:text-blue-300",
          )}
        >
          <Avatar className="size-7 border">
            <AvatarImage src={channel.avatarUrl} alt={channel.title} />
            <AvatarFallback className="bg-slate-900 text-[10px] font-bold text-white">{channel.title.charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="truncate text-sm font-semibold">{channel.title}</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">{channel.messageCount.toLocaleString("zh-CN")} 条分享</span>
        </button>
        <a
          href={channel.telegramUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Telegram <ExternalLink className="size-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="no-scrollbar flex items-center gap-2 overflow-x-auto py-0.5" aria-label="频道筛选">
      <button
        type="button"
        aria-pressed={activeChannel === null}
        onClick={() => onChannelChange(null)}
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          activeChannel === null && "border-slate-900 bg-slate-900 text-white hover:bg-slate-900 dark:border-white dark:bg-white dark:text-slate-950",
        )}
      >
        <RadioTower className="size-3.5" />全部频道
      </button>
      {channels.map((channel) => (
        <button
          key={channel.id}
          type="button"
          aria-pressed={activeChannel === channel.id}
          onClick={() => onChannelChange(channel.id)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border bg-card px-3 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeChannel === channel.id && "border-blue-600 bg-blue-600 text-white hover:bg-blue-600",
          )}
        >
          <Avatar className="size-5 border-0"><AvatarImage src={channel.avatarUrl} alt="" /><AvatarFallback className="text-[9px]">{channel.title.charAt(0)}</AvatarFallback></Avatar>
          {channel.title}
        </button>
      ))}
    </div>
  );
}

function SidebarSection({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold"><Icon className="size-4 text-muted-foreground" />{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SidebarModules({ data, loading, onTagClick, onOpenMessage }: {
  data: HomepageData | null;
  loading: boolean;
  onTagClick: (tag: string) => void;
  onOpenMessage?: () => void;
}) {
  if (loading) {
    return <aside className="space-y-3">{Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-40 w-full rounded-xl" />)}</aside>;
  }

  return (
    <aside className="space-y-3">
      <SidebarSection icon={Hash} title="热门话题">
        {data?.hotTopics.length ? (
          <div className="flex flex-wrap gap-2">
            {data.hotTopics.map(({ tag, count }, index) => (
              <button
                key={tag}
                type="button"
                onClick={() => onTagClick(tag)}
                className={cn(
                  "rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium transition hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-blue-950/40 dark:hover:text-blue-300",
                  index === 0 && "bg-red-50 text-primary dark:bg-red-950/30",
                )}
              >
                #{tag}<span className="ml-1.5 opacity-55">{count}</span>
              </button>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">内容积累后会自动形成话题。</p>}
      </SidebarSection>

      <SidebarSection icon={ImageIcon} title="最近媒体">
        {data?.recentMedia.length ? (
          <div className="grid grid-cols-3 gap-2">
            {data.recentMedia.slice(0, 6).map((message) => {
              const media = message.mediaItems[0] ?? message.media;
              const image = media?.thumb || (media?.type === "photo" ? media.url : undefined);
              return (
                <a
                  key={message.id}
                  href={`/message/${encodeURIComponent(message.id)}`}
                  onClick={onOpenMessage}
                  aria-label={`查看：${message.title}`}
                  className="group relative aspect-square overflow-hidden rounded-lg border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {image ? <img src={image} alt="" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" loading="lazy" /> : <span className="flex size-full items-center justify-center text-blue-600"><Link2 className="size-4" /></span>}
                </a>
              );
            })}
          </div>
        ) : <p className="text-sm text-muted-foreground">暂时没有可预览的媒体。</p>}
      </SidebarSection>
    </aside>
  );
}
