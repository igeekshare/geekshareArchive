"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Archive, ChevronLeft, ChevronRight, Compass } from "lucide-react";
import MessageCard from "@/components/MessageCard";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MessageDiscoveryContext, PublicMessage } from "@/lib/messages";
import { DEFAULT_PUBLIC_SITE_CONFIG, type PublicSiteConfig } from "@/lib/site-config";

function injectedMessage(): PublicMessage | null {
  const node = document.getElementById("__MESSAGE_DATA__");
  if (!node?.textContent) return null;
  try { return JSON.parse(node.textContent) as PublicMessage; } catch { return null; }
}

function currentMessageId() {
  const match = window.location.pathname.match(/^\/message\/([^/]+)\/?$/)?.[1];
  if (!match) return null;
  try { return decodeURIComponent(match); } catch { return null; }
}

function NeighborLink({ message, direction }: { message: PublicMessage | null; direction: "previous" | "next" }) {
  if (!message) return <div />;
  const previous = direction === "previous";
  return (
    <a href={`/message/${encodeURIComponent(message.id)}`} className={`group flex min-w-0 items-center gap-2 rounded-xl border bg-card p-3 transition hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${previous ? "text-left" : "justify-end text-right"}`}>
      {previous && <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />}
      <span className="min-w-0"><span className="block text-[11px] text-muted-foreground">{previous ? "上一篇" : "下一篇"}</span><strong className="mt-0.5 block truncate text-sm">{message.title}</strong></span>
      {!previous && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
    </a>
  );
}

export default function MessageDetailClient() {
  const [message, setMessage] = useState<PublicMessage | null>(null);
  const [discovery, setDiscovery] = useState<MessageDiscoveryContext | null>(null);
  const [siteConfig, setSiteConfig] = useState<PublicSiteConfig>(DEFAULT_PUBLIC_SITE_CONFIG);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch("/api/site-config", { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<PublicSiteConfig> : Promise.reject()).then(setSiteConfig).catch(() => undefined);
  }, []);

  useEffect(() => {
    const id = currentMessageId();
    if (!id) { setNotFound(true); setLoading(false); return; }
    const initial = injectedMessage();
    const messageRequest = initial ? Promise.resolve(initial) : fetch(`/api/messages/${encodeURIComponent(id)}`, { cache: "no-store" }).then((response) => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("message request failed");
      return response.json() as Promise<PublicMessage>;
    });
    const discoveryRequest = fetch(`/api/messages/${encodeURIComponent(id)}/discovery`, { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<MessageDiscoveryContext> : null);

    Promise.all([messageRequest, discoveryRequest])
      .then(([result, context]) => { setMessage(result); setDiscovery(context); setNotFound(!result); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_50%_-15%,rgba(59,130,246,0.06),transparent_30%)]">
      <SiteHeader branding={siteConfig.branding} telegramUrl={message ? `https://t.me/${message.channel.username}` : undefined} />
      <main className="mx-auto max-w-[1120px] px-4 pb-20 pt-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground"><a href="/"><ArrowLeft />返回内容流</a></Button>
          {message && <span className="hidden text-xs text-muted-foreground sm:block">来自 {message.channel.title}</span>}
        </div>

        {loading ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]"><Skeleton className="h-[560px] w-full rounded-xl" /><Skeleton className="hidden h-72 w-full rounded-xl lg:block" /></div>
        ) : notFound || !message ? (
          <div className="rounded-xl border bg-card py-24 text-center">
            <Archive className="mx-auto size-9 text-muted-foreground/50" />
            <h1 className="mt-4 text-xl font-bold">内容未找到</h1>
            <p className="mt-2 text-sm text-muted-foreground">这条内容可能已隐藏，或尚未完成导入。</p>
            <Button asChild className="mt-5"><a href="/">继续浏览</a></Button>
          </div>
        ) : (
          <>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div>
                <MessageCard mode="detail" message={message} onScrollToReply={(replyId) => window.location.assign(`/message/${encodeURIComponent(replyId)}`)} onTagClick={(tag) => window.location.assign(`/?tag=${encodeURIComponent(tag)}#feed`)} />
                <nav aria-label="相邻内容" className="mt-4 grid gap-3 sm:grid-cols-2"><NeighborLink message={discovery?.previous ?? null} direction="previous" /><NeighborLink message={discovery?.next ?? null} direction="next" /></nav>
              </div>

              <aside className="lg:sticky lg:top-[80px]">
                <section className="rounded-xl border bg-card p-4">
                  <h2 className="flex items-center gap-2 text-sm font-bold"><Compass className="size-4 text-primary" />同话题推荐</h2>
                  {discovery?.related.length ? (
                    <ol className="mt-2 divide-y">
                      {discovery.related.map((item, index) => (
                        <li key={item.id}><a href={`/message/${encodeURIComponent(item.id)}`} className="group grid grid-cols-[20px_minmax(0,1fr)] gap-2 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="pt-0.5 text-xs font-bold text-muted-foreground/50">{index + 1}</span><span><strong className="line-clamp-2 text-sm leading-5 transition group-hover:text-blue-600 dark:group-hover:text-blue-300">{item.title}</strong><span className="mt-1 block truncate text-[11px] text-muted-foreground">{item.channel.title}</span></span></a></li>
                      ))}
                    </ol>
                  ) : <p className="mt-3 text-sm leading-6 text-muted-foreground">暂时没有相近内容，回到首页看看最新分享。</p>}
                </section>
                <Button asChild className="mt-3 w-full"><a href="/#feed">继续浏览<ArrowRight /></a></Button>
              </aside>
            </div>

            <div className="mt-8 flex justify-center lg:hidden"><Button asChild><a href="/#feed">继续浏览最新内容<ArrowRight /></a></Button></div>
          </>
        )}
      </main>
    </div>
  );
}
