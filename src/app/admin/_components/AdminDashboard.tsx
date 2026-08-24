"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  EyeOff,
  FileText,
  Loader2,
  RadioTower,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminRequestJson } from "@/lib/admin-api";
import type { PublicMessage } from "@/lib/messages";

type DashboardMessage = PublicMessage & {
  status: "published" | "hidden";
  tags: string[];
  updatedAt: string;
};

type DashboardData = {
  summary: {
    totalMessages: number;
    publishedMessages: number;
    hiddenMessages: number;
    failedMedia: number;
    pendingMedia: number;
    totalChannels: number;
    enabledChannels: number;
    failedUpdates: number;
    processingUpdates: number;
    pendingCleanup: number;
    failedCleanup: number;
  };
  recentMessages: DashboardMessage[];
  recentLogs: Array<{
    id: number;
    channelId?: string | null;
    source: string;
    status: string;
    message?: string | null;
    createdAt: string;
  }>;
  generatedAt: string;
};

async function requestDashboard(): Promise<DashboardData> {
  return adminRequestJson<DashboardData>("/api/admin/dashboard");
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await requestDashboard());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "概览加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center text-sm text-zinc-500">
        <Loader2 className="mr-2 size-4 animate-spin" />正在汇总归档状态…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700" role="alert">
        <p>{error ?? "无法读取后台概览。"}</p>
        <Button variant="outline" size="sm" className="mt-4 border-red-200 bg-white" onClick={() => void load()}>
          <RefreshCw />重新加载
        </Button>
      </div>
    );
  }

  const { summary } = data;
  const attention = summary.failedMedia
    + summary.pendingMedia
    + summary.failedUpdates
    + summary.processingUpdates
    + summary.pendingCleanup
    + summary.failedCleanup;

  return (
    <section aria-labelledby="dashboard-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 id="dashboard-title" className="text-3xl font-semibold tracking-tight text-zinc-950">后台概览</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
            查看公开内容、频道接入和同步故障。数字来自当前 D1，不包含本地演示回退。
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} />刷新
        </Button>
      </div>

      {error && <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">{error}</div>}

      <div className="mt-8 overflow-hidden rounded-2xl bg-zinc-950 text-white shadow-[0_18px_50px_-30px_rgba(24,24,27,0.65)]">
        <div className="grid gap-px bg-white/10 sm:grid-cols-[1.35fr_1fr_1fr_1fr]">
          <Link href="/admin/messages" className="group bg-zinc-950 p-6 transition-colors hover:bg-zinc-900 sm:p-7">
            <p className="text-sm text-zinc-400">归档消息</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums">{summary.totalMessages.toLocaleString("zh-CN")}</p>
            <span className="mt-5 inline-flex items-center gap-1 text-sm text-zinc-300 group-hover:text-white">管理全部内容 <ArrowRight className="size-4" /></span>
          </Link>
          <Link href="/admin/messages?status=published" className="bg-zinc-950 p-6 transition-colors hover:bg-zinc-900">
            <p className="text-sm text-zinc-400">公开展示</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{summary.publishedMessages.toLocaleString("zh-CN")}</p>
            <p className="mt-2 text-xs text-zinc-500">下一次公开请求即时读取</p>
          </Link>
          <Link href="/admin/messages?status=hidden" className="bg-zinc-950 p-6 transition-colors hover:bg-zinc-900">
            <p className="text-sm text-zinc-400">已隐藏</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{summary.hiddenMessages.toLocaleString("zh-CN")}</p>
            <p className="mt-2 text-xs text-zinc-500">仍保留在持久归档中</p>
          </Link>
          <Link href="/admin/channels" className="bg-zinc-950 p-6 transition-colors hover:bg-zinc-900">
            <p className="text-sm text-zinc-400">启用频道</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{summary.enabledChannels}<span className="text-lg text-zinc-500"> / {summary.totalChannels}</span></p>
            <p className="mt-2 text-xs text-zinc-500">共享一个 Telegram Bot</p>
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
        <div>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-zinc-950">最近更新的内容</h2>
            <Link href="/admin/messages?sort=updated" className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-950 hover:underline">查看全部</Link>
          </div>
          <div className="mt-4 divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {data.recentMessages.length ? data.recentMessages.map((message) => (
              <Link key={message.id} href={`/admin/messages?q=${encodeURIComponent(message.id)}`} className="group flex items-start gap-4 px-4 py-4 transition-colors hover:bg-zinc-50 sm:px-5">
                <span className={`mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg ${message.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {message.status === "published" ? <FileText className="size-4" /> : <EyeOff className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-900">{message.plainText || "媒体消息"}</span>
                  <span className="mt-1 block text-xs text-zinc-500">{message.channel.title} · {formatTime(message.updatedAt)}</span>
                </span>
                <ArrowRight className="mt-2 size-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-600" />
              </Link>
            )) : <p className="px-5 py-12 text-center text-sm text-zinc-500">还没有归档消息。接入频道并注册 Webhook 后，新内容会显示在这里。</p>}
          </div>
        </div>

        <aside className="space-y-7" aria-label="需要关注的运行状态">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">运行状态</h2>
            <div className={`mt-4 rounded-xl p-5 ${attention ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950"}`}>
              <div className="flex items-center gap-3">
                {attention ? <AlertTriangle className="size-5 text-amber-700" /> : <CheckCircle2 className="size-5 text-emerald-700" />}
                <p className="font-semibold">{attention ? `${attention} 项需要处理` : "未发现持久化故障"}</p>
              </div>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between gap-4"><dt>媒体归档失败</dt><dd className="font-semibold tabular-nums">{summary.failedMedia}</dd></div>
                <div className="flex justify-between gap-4"><dt>媒体等待归档</dt><dd className="font-semibold tabular-nums">{summary.pendingMedia}</dd></div>
                <div className="flex justify-between gap-4"><dt>Webhook Update 失败</dt><dd className="font-semibold tabular-nums">{summary.failedUpdates}</dd></div>
                <div className="flex justify-between gap-4"><dt>Webhook Update 处理中</dt><dd className="font-semibold tabular-nums">{summary.processingUpdates}</dd></div>
                <div className="flex justify-between gap-4"><dt>删除清理失败</dt><dd className="font-semibold tabular-nums">{summary.failedCleanup}</dd></div>
                <div className="flex justify-between gap-4"><dt>删除等待清理</dt><dd className="font-semibold tabular-nums">{summary.pendingCleanup}</dd></div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline" className="border-current/20 bg-white/70"><Link href="/admin/messages?mediaStatus=failed">查看失败媒体</Link></Button>
                <Button asChild size="sm" variant="outline" className="border-current/20 bg-white/70"><Link href="/admin/sync">同步运维</Link></Button>
              </div>
            </div>
          </div>

          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-800"><RadioTower className="size-4 text-zinc-500" />最近同步日志</h2>
            <div className="mt-3 space-y-3">
              {data.recentLogs.length ? data.recentLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="border-b border-zinc-200 pb-3 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-xs font-medium ${log.status === "failed" ? "text-red-700" : "text-zinc-600"}`}>{log.source} · {log.status}</span>
                    <time className="text-xs text-zinc-400">{formatTime(log.createdAt)}</time>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-600">{log.message || "无附加信息"}</p>
                </div>
              )) : <p className="text-sm text-zinc-500">暂无同步日志。</p>}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
