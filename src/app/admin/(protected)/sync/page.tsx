"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Unplug,
  Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { adminRequestJson as requestJson } from "@/lib/admin-api";

type TelegramStatus = {
  configured: { botToken: boolean; webhookSecret: boolean };
  expectedWebhookUrl: string;
  bot: { id: number; first_name: string; username?: string } | null;
  webhook: {
    url?: string;
    pending_update_count?: number;
    last_error_message?: string;
    allowed_updates?: string[];
  } | null;
  connectionError: string | null;
  latestLog?: { message?: string; status?: string; createdAt?: string } | null;
  updates?: { failed_updates?: number; processing_updates?: number } | null;
};

function StatusPill({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
      {ready ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}{children}
    </span>
  );
}

export default function SyncPage() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [messageId, setMessageId] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await requestJson<TelegramStatus>("/api/admin/telegram"));
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "同步状态加载失败" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  async function operate(action: "test" | "register" | "disable") {
    setBusy(action);
    setNotice(null);
    try {
      if (action === "test") {
        const result = await requestJson<{ bot: { first_name: string; username?: string } }>("/api/admin/telegram/test", { method: "POST", headers: { "Content-Type": "application/json" } });
        setNotice({ tone: "success", text: `连接成功：${result.bot.first_name}${result.bot.username ? ` (@${result.bot.username})` : ""}` });
      } else {
        await requestJson("/api/admin/telegram/webhook", { method: action === "register" ? "PUT" : "DELETE", headers: { "Content-Type": "application/json" } });
        setNotice({ tone: "success", text: action === "register" ? "Webhook 已注册并校准。" : "Webhook 已停用，待处理 Update 未被丢弃。" });
      }
      setConfirmDisable(false);
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "操作失败" });
    } finally {
      setBusy(null);
    }
  }

  async function retry(event: React.FormEvent) {
    event.preventDefault();
    setBusy("retry");
    setNotice(null);
    try {
      const body = await requestJson<{ archiveStatus?: string }>(`/api/admin/messages/${encodeURIComponent(messageId.trim())}/retry-media`, { method: "POST", headers: { "Content-Type": "application/json" } });
      setNotice({ tone: "success", text: `媒体重试完成，当前状态：${body.archiveStatus ?? "unknown"}` });
      setMessageId("");
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "媒体重试失败" });
    } finally {
      setBusy(null);
    }
  }

  const webhookReady = Boolean(status?.webhook?.url && status.webhook.url === status.expectedWebhookUrl);
  const secretsReady = Boolean(status?.configured.botToken && status.configured.webhookSecret);

  return (
    <section aria-labelledby="page-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 id="page-title" className="text-3xl font-semibold tracking-tight text-zinc-950">Telegram 同步</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">检查共享 Bot 与 Webhook，处理日常连接和媒体归档问题。密钥只保存在 Cloudflare Secrets。</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading || busy !== null}><RefreshCw className={loading ? "animate-spin" : ""} />刷新状态</Button>
      </div>

      {notice && <div role={notice.tone === "error" ? "alert" : "status"} className={`mt-6 flex items-start gap-2 rounded-md border px-4 py-3 text-sm ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}{notice.text}</div>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <div className="space-y-6">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="flex items-center gap-2 text-base font-semibold"><Bot className="size-4 text-zinc-500" />共享 Bot</h2><p className="mt-1 text-sm text-zinc-500">所有受管频道共用此连接。</p></div>
              <StatusPill ready={secretsReady}>{secretsReady ? "密钥已配置" : "密钥不完整"}</StatusPill>
            </div>
            {loading && !status ? <div className="mt-6 flex h-24 items-center justify-center text-sm text-zinc-500"><Loader2 className="mr-2 size-4 animate-spin" />正在连接 Telegram…</div> : (
              <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <div><dt className="text-xs text-zinc-500">Bot 身份</dt><dd className="mt-1 text-sm font-medium">{status?.bot ? `${status.bot.first_name}${status.bot.username ? ` · @${status.bot.username}` : ""}` : "未连接"}</dd></div>
                <div><dt className="text-xs text-zinc-500">Webhook Secret</dt><dd className="mt-1 text-sm font-medium">{status?.configured.webhookSecret ? "已配置" : "未配置"}</dd></div>
              </dl>
            )}
            {status?.connectionError && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">连接错误：{status.connectionError}</p>}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="outline" disabled={busy !== null || !status?.configured.botToken} onClick={() => void operate("test")}>{busy === "test" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}测试 Bot 连接</Button>
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="flex items-center gap-2 text-base font-semibold"><Webhook className="size-4 text-zinc-500" />Webhook</h2><p className="mt-1 text-sm text-zinc-500">实时接收新帖、编辑和反应更新。</p></div>
              <StatusPill ready={webhookReady}>{webhookReady ? "地址正常" : "需要校准"}</StatusPill>
            </div>
            <dl className="mt-6 space-y-4">
              <div><dt className="text-xs text-zinc-500">期望地址</dt><dd className="mt-1 break-all text-sm font-medium">{status?.expectedWebhookUrl ?? "—"}</dd></div>
              <div><dt className="text-xs text-zinc-500">Telegram 当前地址</dt><dd className="mt-1 break-all text-sm font-medium">{status?.webhook?.url || "未注册"}</dd></div>
              <div><dt className="text-xs text-zinc-500">订阅 Update</dt><dd className="mt-2 flex flex-wrap gap-2">{(status?.webhook?.allowed_updates ?? []).length ? status?.webhook?.allowed_updates?.map((item) => <span key={item} className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{item}</span>) : <span className="text-sm text-zinc-500">暂无</span>}</dd></div>
            </dl>
            {status?.webhook?.last_error_message && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Telegram：{status.webhook.last_error_message}</p>}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button disabled={busy !== null || !secretsReady} onClick={() => void operate("register")} className="bg-zinc-900 text-white hover:bg-zinc-800">{busy === "register" ? <Loader2 className="animate-spin" /> : <Link2 />}{webhookReady ? "重新注册 Webhook" : "注册 Webhook"}</Button>
              <Button variant="outline" disabled={busy !== null || !status?.webhook?.url} onClick={() => setConfirmDisable(true)} className="text-red-700 hover:bg-red-50 hover:text-red-800"><Unplug />停用 Webhook</Button>
            </div>
          </section>

          <form onSubmit={retry} className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold"><RotateCcw className="size-4 text-zinc-500" />重试单条消息媒体</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">正文已经保存时，可按归档消息 ID 重新拉取失败的媒体。</p>
            <label htmlFor="retry-message-id" className="mt-5 block text-sm font-medium text-zinc-800">归档消息 ID</label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row"><Input id="retry-message-id" value={messageId} onChange={(event) => setMessageId(event.target.value)} required placeholder="message123 或 tl_gc_7601" className="flex-1" /><Button disabled={busy !== null}>{busy === "retry" ? <Loader2 className="animate-spin" /> : <RotateCcw />}重试媒体</Button></div>
          </form>
        </div>

        <aside className="space-y-4" aria-label="同步运行状态">
          <h2 className="text-sm font-semibold text-zinc-700">运行状态</h2>
          <dl className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-4"><dt className="text-sm text-zinc-600">Telegram 待处理</dt><dd className="text-xl font-semibold tabular-nums">{status?.webhook?.pending_update_count ?? "—"}</dd></div>
            <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-4"><dt className="text-sm text-zinc-600">本地失败</dt><dd className="text-xl font-semibold tabular-nums text-red-600">{status?.updates?.failed_updates ?? 0}</dd></div>
            <div className="flex items-center justify-between gap-4 px-4 py-4"><dt className="text-sm text-zinc-600">处理中</dt><dd className="text-xl font-semibold tabular-nums">{status?.updates?.processing_updates ?? 0}</dd></div>
          </dl>
          <div className="rounded-lg border border-zinc-200 bg-white p-4"><h3 className="text-sm font-semibold">最近健康日志</h3><p className="mt-2 text-sm leading-6 text-zinc-600">{status?.latestLog?.message || "暂无健康检查记录"}</p></div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">历史消息回填继续使用本地 CLI；后台不会启动长任务或保存 Bot Token。</div>
        </aside>
      </div>

      <Dialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <DialogContent>
          <DialogTitle>停用 Telegram Webhook？</DialogTitle>
          <DialogDescription>停用后不会再接收新推送。Telegram 队列中尚未处理的 Update 会保留，重新注册后可继续接收。</DialogDescription>
          <div className="mt-2 flex justify-end gap-3"><DialogClose asChild><Button variant="outline">取消</Button></DialogClose><Button variant="destructive" disabled={busy !== null} onClick={() => void operate("disable")}>{busy === "disable" ? <Loader2 className="animate-spin" /> : <Unplug />}确认停用</Button></div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
