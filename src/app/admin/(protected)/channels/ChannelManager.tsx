"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, Radio, Save, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { adminRequestJson as api } from "@/lib/admin-api";

export type AdminChannel = {
  id: string;
  username: string;
  title: string;
  description: string | null;
  avatarUrl: string | null;
  enabled: boolean;
  messageCount: number;
  sourceMessageCount: number;
  deletable: boolean;
  telegramChatId: string | null;
  botPermission: string;
  lastError: string | null;
  lastSyncedAt: string | null;
  lastWebhookAt: string | null;
  lastSyncedMessageId: number | null;
  createdAt: string;
  updatedAt: string;
};

function formatTime(value: string | null): string {
  if (!value) return "尚无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(date);
}

function permissionLabel(value: string): { ready: boolean; text: string } {
  if (value === "administrator" || value === "creator") return { ready: true, text: "Bot 管理员" };
  if (value === "unconfigured") return { ready: false, text: "Bot 未配置" };
  if (value === "member") return { ready: false, text: "Bot 非管理员" };
  return { ready: false, text: "权限待检查" };
}

export default function ChannelManager() {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminChannel | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setChannels(await api<AdminChannel[]>("/api/admin/channels"));
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "频道加载失败" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void reload(), [reload]);

  async function addChannel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusyId("new");
    setNotice(null);
    try {
      await api("/api/admin/channels", {
        method: "POST",
        body: JSON.stringify({ username: data.get("username") }),
      });
      form.reset();
      setNotice({ tone: "success", text: "频道已接入，新推送会通过共享 Bot 实时归档。" });
      await reload();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "添加失败" });
    } finally {
      setBusyId(null);
    }
  }

  async function updateChannel(event: React.FormEvent<HTMLFormElement>, channel: AdminChannel) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const username = String(data.get("username") ?? "").trim().replace(/^@/, "");
    const body: Record<string, unknown> = {
      title: data.get("title"),
      description: data.get("description"),
      enabled: data.get("enabled") === "on",
    };
    if (username.toLocaleLowerCase() !== channel.username.toLocaleLowerCase()) {
      body.username = username;
    }
    setBusyId(channel.id);
    setNotice(null);
    try {
      await api(`/api/admin/channels/${encodeURIComponent(channel.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setNotice({ tone: "success", text: `@${channel.username} 的频道设置已保存。` });
      await reload();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteChannel() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setNotice(null);
    try {
      await api(`/api/admin/channels/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      setNotice({ tone: "success", text: `@${deleteTarget.username} 已删除。` });
      setDeleteTarget(null);
      await reload();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "删除失败" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6">
        <h2 className="text-base font-semibold">接入 Telegram 频道</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">先将共享 Bot 设置为频道管理员，再输入公开 username。系统会校验频道身份和 Bot 权限。</p>
        <form onSubmit={addChannel} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-medium text-zinc-800">频道 username
            <Input name="username" required minLength={5} maxLength={64} placeholder="xgeekshare" className="mt-2" />
          </label>
          <Button disabled={busyId !== null} className="bg-zinc-900 text-white hover:bg-zinc-800">
            {busyId === "new" ? <Loader2 className="animate-spin" /> : <Plus />}{busyId === "new" ? "正在校验…" : "添加频道"}
          </Button>
        </form>
      </section>

      {notice && (
        <div role={notice.tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-md border px-4 py-3 text-sm ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {notice.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}{notice.text}
        </div>
      )}

      {loading && channels.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm text-zinc-500"><Loader2 className="mr-2 size-4 animate-spin" />正在加载频道…</div>
      ) : channels.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-5 py-14 text-center">
          <Radio className="mx-auto size-8 text-zinc-400" /><h2 className="mt-3 text-sm font-semibold">还没有接入频道</h2><p className="mt-1 text-xs text-zinc-500">添加第一个频道后，新推送会自动进入归档。</p>
        </div>
      ) : (
        <section className="space-y-4" aria-label="频道列表">
          {channels.map((channel) => {
            const permission = permissionLabel(channel.botPermission);
            return (
              <article key={channel.id} className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-12 border border-zinc-200"><AvatarImage src={channel.avatarUrl ?? undefined} alt={channel.title} /><AvatarFallback className="bg-zinc-900 font-semibold text-white">{channel.title.charAt(0)}</AvatarFallback></Avatar>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-semibold">{channel.title}</h2>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${channel.enabled ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>{channel.enabled ? "同步中" : "已归档"}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${permission.ready ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}`}>{permission.text}</span>
                      </div>
                      <p className="mt-1 text-sm text-zinc-500">@{channel.username}</p>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:text-right">
                    <div><dt className="text-xs text-zinc-500">历史消息</dt><dd className="mt-0.5 font-semibold tabular-nums">{channel.messageCount}</dd></div>
                    <div><dt className="text-xs text-zinc-500">最后推送</dt><dd className="mt-0.5 text-xs font-medium">{formatTime(channel.lastWebhookAt)}</dd></div>
                  </dl>
                </div>

                {channel.lastError && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">最近错误：{channel.lastError}</p>}

                <details className="mt-5 rounded-md border border-zinc-200 bg-zinc-50">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"><Pencil className="size-4" />编辑频道</summary>
                  <form onSubmit={(event) => updateChannel(event, channel)} className="space-y-4 border-t border-zinc-200 p-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-medium text-zinc-800">标题<Input name="title" required maxLength={120} defaultValue={channel.title} className="mt-2" /></label>
                      <label className="block text-sm font-medium text-zinc-800">Username<Input name="username" required minLength={5} maxLength={64} defaultValue={channel.username} className="mt-2" /></label>
                    </div>
                    <label className="block text-sm font-medium text-zinc-800">简介<textarea name="description" rows={3} maxLength={500} defaultValue={channel.description ?? ""} className="mt-2 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200" /></label>
                    <label className="flex items-start gap-3 rounded-md border border-zinc-200 bg-white p-3 text-sm"><input type="checkbox" name="enabled" defaultChecked={channel.enabled} className="mt-0.5 size-4 rounded border-zinc-300" /><span><strong className="block font-medium">接收新推送</strong><span className="mt-1 block text-xs leading-5 text-zinc-500">关闭后历史内容仍公开，并在前台标记为已归档。</span></span></label>
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <Button disabled={busyId !== null} className="bg-zinc-900 text-white hover:bg-zinc-800">{busyId === channel.id ? <Loader2 className="animate-spin" /> : <Save />}保存设置</Button>
                      {channel.deletable ? (
                        <Button type="button" variant="outline" disabled={busyId !== null} onClick={() => setDeleteTarget(channel)} className="text-red-700 hover:bg-red-50 hover:text-red-800"><Trash2 />删除空频道</Button>
                      ) : (
                        <span className="text-xs text-zinc-500">作为来源或展示频道关联消息时只能停用，不能删除。</span>
                      )}
                    </div>
                  </form>
                </details>
              </article>
            );
          })}
        </section>
      )}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogTitle>删除空频道？</DialogTitle>
          <DialogDescription>将删除 @{deleteTarget?.username} 的频道配置。该频道目前没有归档消息，此操作不会删除 Telegram 中的内容。</DialogDescription>
          <div className="mt-2 flex justify-end gap-3"><DialogClose asChild><Button variant="outline">取消</Button></DialogClose><Button variant="destructive" disabled={busyId !== null} onClick={() => void deleteChannel()}>{busyId === deleteTarget?.id ? <Loader2 className="animate-spin" /> : <Trash2 />}确认删除</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
