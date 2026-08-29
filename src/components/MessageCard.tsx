"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Copy, Download, ExternalLink, FileText, ImageIcon, Link2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { PublicMedia, PublicMessage } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const MessageLightbox = dynamic(() => import("@/components/MessageLightbox"), { ssr: false });

function mediaUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith("/") ? value : `/${value}`;
}

function formatMessageDate(value: string): { date: string; time: string } {
  const telegram = value.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})/);
  if (telegram) return { date: `${telegram[3]}年${telegram[2]}月${telegram[1]}日`, time: telegram[4] };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: value, time: "" };
  return {
    date: new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" }).format(parsed),
    time: new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(parsed),
  };
}

function formatFileSize(size?: number) {
  if (!size || size <= 0) return null;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function titleLinkLabel(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === "mailto:") return url.pathname;
    if (url.protocol === "tg:") return "Telegram";
    return url.hostname.replace(/^www\./i, "") || "原标题链接";
  } catch {
    return "原标题链接";
  }
}

function MediaItem({ media, onOpenPhoto }: { media: PublicMedia; onOpenPhoto?: () => void }) {
  const url = mediaUrl(media.url);
  const thumb = mediaUrl(media.thumb);
  if (!url) {
    return (
      <div className="flex min-h-24 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-4 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
        <ImageIcon className="size-4" />媒体暂不可用，正文不受影响
      </div>
    );
  }

  if (media.type === "photo") {
    return (
      <button type="button" onClick={onOpenPhoto} aria-label="查看内容大图" className="flex w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <img src={thumb || url} alt={media.description || "内容配图"} className="block h-auto max-h-[min(70vh,640px)] max-w-full object-contain" loading="lazy" />
      </button>
    );
  }

  if (media.type === "video") {
    return <video src={url} poster={thumb} controls preload="metadata" playsInline className="max-h-[min(70vh,640px)] w-full rounded-lg border bg-slate-950 object-contain" />;
  }

  if (media.type === "file") {
    const meta = [media.mimeType?.split("/").pop()?.toUpperCase(), formatFileSize(media.size)].filter(Boolean).join(" · ");
    return (
      <a href={url} download className="group flex items-center gap-3 rounded-lg border bg-muted/30 p-3 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><FileText className="size-5" /></span>
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{media.title || "下载附件"}</strong>{meta && <span className="mt-0.5 block text-xs text-muted-foreground">{meta}</span>}</span>
        <Download className="size-4 text-muted-foreground transition group-hover:text-blue-600" />
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-300 dark:hover:bg-blue-950/40">
      <Link2 className="size-4" />{media.title || media.description || "打开相关链接"}<ExternalLink className="ml-auto size-3.5" />
    </a>
  );
}

function MessageMedia({ message }: { message: PublicMessage }) {
  const [openPhotoIndex, setOpenPhotoIndex] = useState<number | null>(null);
  const items = message.mediaItems.length ? message.mediaItems : message.media ? [message.media] : [];
  if (!items.length) return null;
  const photos = items.flatMap((media) => {
    const src = media.type === "photo" ? mediaUrl(media.url) : undefined;
    return src ? [{ media, src, alt: media.description || "内容图片" }] : [];
  });

  return (
    <>
      <div className={cn("mt-4 grid items-start gap-2", items.length > 1 && "sm:grid-cols-2")}>
        {items.map((media, index) => {
          const photoIndex = photos.findIndex((photo) => photo.media === media);
          return <MediaItem key={`${media.url ?? media.type}-${index}`} media={media} onOpenPhoto={photoIndex >= 0 ? () => setOpenPhotoIndex(photoIndex) : undefined} />;
        })}
      </div>
      {openPhotoIndex !== null && (
        <MessageLightbox
          slides={photos.map(({ src, alt }) => ({ src, alt }))}
          initialIndex={openPhotoIndex}
          onClose={() => setOpenPhotoIndex(null)}
        />
      )}
    </>
  );
}

function MessageBody({
  html,
  detail,
  href,
  onOpenDetail,
}: {
  html: string;
  detail: boolean;
  href: string;
  onOpenDetail?: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || detail || !html) {
      setOverflowing(false);
      return;
    }

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const nextOverflowing = body.scrollHeight > body.clientHeight + 1;
      setOverflowing(nextOverflowing);

      const visibleBounds = body.getBoundingClientRect();
      body.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
        const visible = !nextOverflowing || [...link.getClientRects()].some((rect) => (
          rect.bottom > visibleBounds.top && rect.top < visibleBounds.bottom
        ));
        if (visible) {
          if (link.dataset.feedClamped === "true") {
            link.removeAttribute("tabindex");
            delete link.dataset.feedClamped;
          }
        } else {
          link.tabIndex = -1;
          link.dataset.feedClamped = "true";
        }
      });
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(body);
    void document.fonts?.ready.then(measure);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      body.querySelectorAll<HTMLAnchorElement>('a[data-feed-clamped="true"]').forEach((link) => {
        link.removeAttribute("tabindex");
        delete link.dataset.feedClamped;
      });
    };
  }, [detail, html]);

  if (!html) return null;

  return (
    <div className="mt-3">
      <div className="relative">
        <div
          ref={bodyRef}
          className={cn(
            "message-reading-body break-words text-foreground/90 [&_a]:font-medium [&_a]:text-blue-600 [&_a]:underline-offset-2 hover:[&_a]:underline dark:[&_a]:text-blue-300",
            !detail && "message-reading-body--clamped",
          )}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {!detail && overflowing && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card via-card/90 to-transparent" />}
      </div>
      {!detail && overflowing && (
        <a href={href} onClick={onOpenDetail} className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-blue-600 underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-300">
          查看完整内容<ArrowRight className="size-3.5" />
        </a>
      )}
    </div>
  );
}

type MessageCardProps = {
  message: PublicMessage;
  mode?: "feed" | "detail";
  onScrollToReply?: (replyId: string) => void;
  onTagClick?: (tag: string) => void;
  onOpenDetail?: () => void;
  className?: string;
};

export default function MessageCard({ message, mode = "feed", onScrollToReply, onTagClick, onOpenDetail, className }: MessageCardProps) {
  const detail = mode === "detail";
  const formatted = useMemo(() => formatMessageDate(message.datetime ?? message.date), [message.date, message.datetime]);
  const href = `/message/${encodeURIComponent(message.id)}`;
  const initial = message.channel.title?.charAt(0) || message.from?.charAt(0) || "极";
  const richTitle = message.titleHtml?.trim();
  const richTitleClassName = "break-words";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${href}`);
      toast.success("归档链接已复制");
    } catch {
      toast.error("复制失败，请从地址栏手动复制链接。");
    }
  };

  return (
    <article id={message.id} className={cn("group rounded-xl border bg-card p-4 sm:p-5", detail ? "sm:p-7" : "transition-colors hover:border-slate-300 dark:hover:border-slate-600", className)}>
      <header className="flex items-start gap-3">
        <Avatar className="mt-0.5 size-9 shrink-0 border sm:size-10">
          <AvatarImage src={message.channel.avatarUrl} alt={message.channel.title} />
          <AvatarFallback className="bg-slate-900 text-sm font-bold text-white">{initial}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="truncate font-semibold text-foreground/80">{message.channel.title || message.from}</span>
            <span aria-hidden="true">·</span>
            <time title={message.datetime ?? message.date}>{formatted.date}{formatted.time ? ` ${formatted.time}` : ""}</time>
            {message.isFeatured && <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-primary dark:bg-red-950/30">精选</span>}
            {message.archiveStatus !== "archived" && message.archiveStatus !== "none" && <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3" />{message.archiveStatus === "failed" ? "媒体异常" : "媒体处理中"}</span>}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="-mr-2 -mt-2 size-8 shrink-0 text-muted-foreground" aria-label="内容操作"><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!detail && <DropdownMenuItem asChild><a href={href} onClick={onOpenDetail}><ArrowRight />阅读全文</a></DropdownMenuItem>}
            <DropdownMenuItem asChild><a href={message.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink />Telegram 原文</a></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copyLink()}><Copy />复制归档链接</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {message.replyTo && (
        <button type="button" onClick={() => onScrollToReply?.(message.replyTo!)} className="mt-3 min-h-11 w-full rounded-lg border border-red-100 bg-red-50/70 px-3 py-2 text-left text-xs text-muted-foreground transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-red-950/60 dark:bg-red-950/20">回复了另一条内容，点击查看上下文</button>
      )}

      <div className="mt-3 sm:mt-4">
        {detail ? (
          <>
            <h1 className="text-balance text-2xl font-extrabold leading-[1.32] tracking-[-0.02em] sm:text-[2rem]">
              {richTitle
                ? <span className={richTitleClassName} dangerouslySetInnerHTML={{ __html: richTitle }} />
                : message.title}
            </h1>
            {message.titleUrl && (
              <a
                href={message.titleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-md text-sm font-semibold text-blue-600 underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-300"
              >
                <span className="truncate">打开原标题链接 · {titleLinkLabel(message.titleUrl)}</span>
                <ExternalLink className="size-3.5 shrink-0" />
              </a>
            )}
          </>
        ) : (
          <h2 className="text-balance text-lg font-extrabold leading-[1.4] tracking-[-0.01em] sm:text-xl">
            {richTitle ? (
              <a
                href={href}
                onClick={onOpenDetail}
                className="block rounded-sm transition hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-blue-300"
                dangerouslySetInnerHTML={{ __html: richTitle }}
              />
            ) : (
              <a
                href={href}
                onClick={onOpenDetail}
                className="transition hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-blue-300"
              >
                {message.title}
              </a>
            )}
          </h2>
        )}

        {message.tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {message.tags.map((tag) => (
              <button key={tag} type="button" onClick={() => onTagClick?.(tag)} disabled={!onTagClick} className="min-h-8 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 transition enabled:hover:bg-blue-100 enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-ring disabled:cursor-default dark:bg-blue-950/40 dark:text-blue-300">#{tag}</button>
            ))}
          </div>
        )}

        <MessageBody html={message.text} detail={detail} href={href} onOpenDetail={onOpenDetail} />

        <MessageMedia message={message} />

        {message.reactions?.length ? (
          <footer className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
            {message.reactions.map((reaction) => (
              <span key={`${reaction.emoji}-${reaction.count}`} className="inline-flex h-7 items-center gap-1 rounded-full bg-muted px-2.5 text-xs"><span>{reaction.emoji}</span><span className="font-medium text-muted-foreground">{reaction.count}</span></span>
            ))}
          </footer>
        ) : null}
      </div>
    </article>
  );
}
