"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FilterX,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminRequestJson as requestJson } from "@/lib/admin-api";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { PublicMessage } from "@/lib/messages";

type AdminChannelOption = {
  id: string;
  title: string;
  username: string;
  enabled: boolean;
};

type AdminMessage = PublicMessage & {
  displayTitle: string | null;
  displaySummary: string | null;
  originChannelId: string;
  originChannel: { title: string; username: string };
  tags: string[];
  status: "published" | "hidden";
  adminOverride: boolean;
  adminUpdatedAt: string | null;
  adminUpdatedBy: string | null;
  updatedAt: string;
};

type MessageResponse = {
  items: AdminMessage[];
  page: number;
  total: number;
  totalPages: number;
  channels: AdminChannelOption[];
};

type Filters = {
  q: string;
  channel: string;
  status: "all" | "published" | "hidden";
  mediaStatus: "all" | "none" | "archived" | "external" | "pending" | "failed";
  sort: "newest" | "oldest" | "updated";
};

type BulkAction = "publish" | "hide" | "delete" | "retry-media";

const defaultFilters: Filters = {
  q: "",
  channel: "",
  status: "all",
  mediaStatus: "all",
  sort: "newest",
};

const selectClass = "h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200";

function formatTime(value: string | undefined | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function inputDate(value: string | undefined): string {
  if (!value) return "";
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return match?.[1] ?? "";
}

function archiveLabel(value: AdminMessage["archiveStatus"]): string {
  return {
    none: "无媒体",
    archived: "已归档",
    external: "外部媒体",
    pending: "待归档",
    failed: "归档失败",
  }[value];
}

function archiveTone(value: AdminMessage["archiveStatus"]): string {
  if (value === "failed") return "bg-red-50 text-red-700";
  if (value === "pending") return "bg-amber-50 text-amber-700";
  if (value === "archived") return "bg-blue-50 text-blue-700";
  return "bg-zinc-100 text-zinc-600";
}

function statusChoiceClass(active: boolean, tone: "published" | "hidden"): string {
  if (!active) return "border-zinc-200 bg-white text-zinc-700";
  return tone === "published"
    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
    : "border-amber-300 bg-amber-50 text-amber-900";
}

function readInitialFilters(): { filters: Filters; page: number } {
  if (typeof window === "undefined") return { filters: defaultFilters, page: 1 };
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status");
  const mediaStatus = params.get("mediaStatus");
  const sort = params.get("sort");
  return {
    filters: {
      q: params.get("q") ?? "",
      channel: params.get("channel") ?? "",
      status: status === "published" || status === "hidden" ? status : "all",
      mediaStatus: ["none", "archived", "external", "pending", "failed"].includes(mediaStatus ?? "")
        ? mediaStatus as Filters["mediaStatus"]
        : "all",
      sort: sort === "oldest" || sort === "updated" ? sort : "newest",
    },
    page: Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1),
  };
}

export default function MessageManager() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [searchDraft, setSearchDraft] = useState("");
  const [page, setPage] = useState(1);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<MessageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<AdminMessage | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);

  useEffect(() => {
    const initial = readInitialFilters();
    setFilters(initial.filters);
    setSearchDraft(initial.filters.q);
    setPage(initial.page);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.channel) params.set("channel", filters.channel);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.mediaStatus !== "all") params.set("mediaStatus", filters.mediaStatus);
    if (filters.sort !== "newest") params.set("sort", filters.sort);
    if (page > 1) params.set("page", String(page));
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    setSelected(new Set());
    setLoading(true);
    setLoadError(null);
    requestJson<MessageResponse>(`/api/admin/messages?${params}`, { signal: controller.signal })
      .then((response) => {
        setData(response);
        if (response.page !== page) setPage(response.page);
        setSelected(new Set());
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setData(null);
        setLoadError(reason instanceof Error ? reason.message : "消息加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, page, ready, reloadToken]);

  const reload = useCallback(() => {
    setSelected(new Set());
    setLoading(true);
    setReloadToken((value) => value + 1);
  }, []);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setSelected(new Set());
    setDeleteIds([]);
    setLoading(true);
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function changePage(nextPage: number) {
    setSelected(new Set());
    setDeleteIds([]);
    setLoading(true);
    setPage(Math.max(1, nextPage));
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    updateFilter("q", searchDraft.trim());
  }

  function toggleSelection(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePageSelection() {
    const ids = data?.items.map((item) => item.id) ?? [];
    setSelected((current) => {
      const allSelected = ids.length > 0 && ids.every((id) => current.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }

  async function patchMessage(id: string, body: Record<string, unknown>, successText: string) {
    setBusy(id);
    setNotice(null);
    try {
      await requestJson(`/api/admin/messages/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setNotice({ tone: "success", text: successText });
      setEditing(null);
      reload();
    } catch (reason) {
      setNotice({ tone: "error", text: reason instanceof Error ? reason.message : "消息保存失败" });
    } finally {
      setBusy(null);
    }
  }

  async function retryOne(message: AdminMessage) {
    setBusy(message.id);
    setNotice(null);
    try {
      const result = await requestJson<{ archiveStatus?: string }>(
        `/api/admin/messages/${encodeURIComponent(message.id)}/retry-media`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      setNotice({ tone: "success", text: `媒体重试完成，当前状态：${result.archiveStatus ?? "unknown"}` });
      reload();
    } catch (reason) {
      setNotice({ tone: "error", text: reason instanceof Error ? reason.message : "媒体重试失败" });
    } finally {
      setBusy(null);
    }
  }

  async function runBulk(action: Exclude<BulkAction, "delete">) {
    const ids = [...selected];
    if (!ids.length) return;
    if (action === "retry-media" && ids.length > 10) {
      setNotice({ tone: "error", text: "批量媒体重试每次最多选择 10 条消息。" });
      return;
    }
    setBusy(`bulk-${action}`);
    setNotice(null);
    try {
      const result = await requestJson<{ succeeded: number; failed: number }>("/api/admin/messages/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      setNotice({
        tone: result.failed ? "error" : "success",
        text: result.failed
          ? `已完成 ${result.succeeded} 条，${result.failed} 条失败；请缩小筛选后重试。`
          : action === "retry-media"
            ? `已将 ${result.succeeded} 条媒体重试加入后台任务。`
            : `已更新 ${result.succeeded} 条消息。`,
      });
      reload();
    } catch (reason) {
      setNotice({ tone: "error", text: reason instanceof Error ? reason.message : "批量操作失败" });
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deleteIds.length) return;
    setBusy("delete");
    setNotice(null);
    try {
      if (deleteIds.length === 1) {
        const result = await requestJson<{ ok: boolean; status: "complete" | "failed"; error?: string }>(
          `/api/admin/messages/${encodeURIComponent(deleteIds[0])}`,
          { method: "DELETE" },
        );
        setNotice(result.status === "complete"
          ? { tone: "success", text: "消息已永久删除，已知 R2 对象已完成清理。" }
          : { tone: "error", text: result.error ?? "消息已从公开站隐藏，媒体清理失败，将由维护任务继续重试。" });
      } else {
        const result = await requestJson<{ succeeded: number; failed: number }>("/api/admin/messages/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", ids: deleteIds }),
        });
        setNotice({
          tone: result.failed ? "error" : "success",
          text: result.failed
            ? `${result.succeeded} 条已删除，${result.failed} 条等待清理或处理失败。`
            : `${result.succeeded} 条消息已永久删除。`,
        });
      }
      setDeleteIds([]);
      reload();
    } catch (reason) {
      setNotice({ tone: "error", text: reason instanceof Error ? reason.message : "永久删除失败" });
    } finally {
      setBusy(null);
    }
  }

  const allPageSelected = Boolean(data?.items.length) && data!.items.every((item) => selected.has(item.id));
  const activeFilters = Boolean(filters.q || filters.channel || filters.status !== "all" || filters.mediaStatus !== "all" || filters.sort !== "newest");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
        <form onSubmit={submitSearch} className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">搜索消息</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-zinc-400" />
            <Input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} maxLength={100} placeholder="搜索正文或归档 ID" className="pl-9" />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
            <select aria-label="展示频道" value={filters.channel} onChange={(event) => updateFilter("channel", event.target.value)} className={selectClass}>
              <option value="">全部频道</option>
              {data?.channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.title}</option>)}
            </select>
            <select aria-label="发布状态" value={filters.status} onChange={(event) => updateFilter("status", event.target.value as Filters["status"])} className={selectClass}>
              <option value="all">全部状态</option><option value="published">公开</option><option value="hidden">隐藏</option>
            </select>
            <select aria-label="媒体状态" value={filters.mediaStatus} onChange={(event) => updateFilter("mediaStatus", event.target.value as Filters["mediaStatus"])} className={selectClass}>
              <option value="all">全部媒体</option><option value="failed">归档失败</option><option value="pending">待归档</option><option value="archived">已归档</option><option value="external">外部媒体</option><option value="none">无媒体</option>
            </select>
            <select aria-label="排序" value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value as Filters["sort"])} className={selectClass}>
              <option value="newest">发布时间倒序</option><option value="oldest">发布时间正序</option><option value="updated">最近编辑</option>
            </select>
          </div>
          <Button type="submit" className="bg-zinc-900 text-white hover:bg-zinc-800"><Search />搜索</Button>
        </form>
        {activeFilters && (
          <button type="button" onClick={() => { setSelected(new Set()); setDeleteIds([]); setLoading(true); setFilters(defaultFilters); setSearchDraft(""); setPage(1); }} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline">
            <FilterX className="size-3.5" />清除全部筛选
          </button>
        )}
      </div>

      {loadError && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>消息列表加载失败：{loadError}</span>
          <Button variant="outline" size="sm" className="shrink-0 border-red-200 bg-white" onClick={reload}>
            <RefreshCw />重新加载
          </Button>
        </div>
      )}

      {notice && (
        <div role={notice.tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {notice.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}{notice.text}
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex flex-col gap-3 rounded-xl bg-zinc-950 px-4 py-3 text-white shadow-[0_12px_35px_-24px_rgba(24,24,27,0.8)] sm:flex-row sm:items-center sm:justify-between" role="region" aria-label="批量操作">
          <p className="text-sm"><strong className="font-semibold tabular-nums">已选择 {selected.size} 条</strong><span className="ml-2 text-zinc-400">范围仅限当前页 · 媒体重试每次最多 10 条</span></p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800" disabled={busy !== null} onClick={() => void runBulk("publish")}><Eye />公开</Button>
            <Button size="sm" variant="outline" className="border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800" disabled={busy !== null} onClick={() => void runBulk("hide")}><EyeOff />隐藏</Button>
            <Button size="sm" variant="outline" className="border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800" disabled={busy !== null || selected.size > 10} onClick={() => void runBulk("retry-media")}><RotateCcw />重试媒体</Button>
            <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => setDeleteIds([...selected])}><Trash2 />永久删除</Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-zinc-600">共 <strong className="font-semibold text-zinc-900 tabular-nums">{data?.total ?? 0}</strong> 条消息</p>
        <Button variant="ghost" size="sm" onClick={reload} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />刷新</Button>
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white lg:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-500">
            <tr>
              <th className="w-12 px-4 py-3"><input type="checkbox" checked={allPageSelected} onChange={togglePageSelection} disabled={loading || busy !== null} aria-label="选择当前页全部消息" className="size-4 rounded border-zinc-300" /></th>
              <th className="w-[38%] px-3 py-3">内容</th>
              <th className="w-[17%] px-3 py-3">频道</th>
              <th className="w-[16%] px-3 py-3">状态</th>
              <th className="w-[15%] px-3 py-3">发布时间</th>
              <th className="px-3 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {!loading && data?.items.map((message) => (
              <tr key={message.id} className={`align-top transition-colors hover:bg-zinc-50 ${selected.has(message.id) ? "bg-blue-50/60" : ""}`}>
                <td className="px-4 py-4"><input type="checkbox" checked={selected.has(message.id)} onChange={() => toggleSelection(message.id)} disabled={busy !== null} aria-label={`选择消息 ${message.id}`} className="size-4 rounded border-zinc-300" /></td>
                <td className="px-3 py-4">
                  <button type="button" onClick={() => setEditing(message)} disabled={busy !== null} className="block max-w-full text-left disabled:cursor-not-allowed">
                    <span className="line-clamp-2 font-medium leading-5 text-zinc-900 hover:underline hover:underline-offset-4">{message.title}</span>
                    <span className="mt-1 block truncate text-xs text-zinc-400">{message.id}</span>
                  </button>
                  <div className="mt-2 flex flex-wrap gap-1">{message.isFeatured && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">精选 · {message.featuredOrder}</span>}{message.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">#{tag}</span>)}</div>
                </td>
                <td className="px-3 py-4">
                  <p className="font-medium text-zinc-800">{message.channel.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">@{message.channel.username}</p>
                  {message.channelId !== message.originChannelId && <p className="mt-2 text-xs text-amber-700">来源：@{message.originChannel.username}</p>}
                </td>
                <td className="px-3 py-4">
                  <div className="flex flex-col items-start gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${message.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{message.status === "published" ? "公开" : "隐藏"}</span>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${archiveTone(message.archiveStatus)}`}>{archiveLabel(message.archiveStatus)}</span>
                    {message.adminOverride && <span className="text-[11px] text-zinc-400">后台覆盖</span>}
                  </div>
                </td>
                <td className="px-3 py-4 text-xs leading-5 text-zinc-600">{formatTime(message.datetime ?? message.date)}</td>
                <td className="px-3 py-4">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="编辑消息" disabled={busy !== null} onClick={() => setEditing(message)}><Pencil /></Button>
                    <Button variant="ghost" size="icon" title={message.status === "published" ? "隐藏消息" : "公开消息"} disabled={busy !== null} onClick={() => void patchMessage(message.id, { status: message.status === "published" ? "hidden" : "published" }, message.status === "published" ? "消息已隐藏。" : "消息已恢复公开。")}>{message.status === "published" ? <EyeOff /> : <Eye />}</Button>
                    {message.media && <Button variant="ghost" size="icon" title="重试媒体归档" disabled={busy !== null} onClick={() => void retryOne(message)}>{busy === message.id ? <Loader2 className="animate-spin" /> : <RotateCcw />}</Button>}
                    <Button variant="ghost" size="icon" title="永久删除" className="text-red-600 hover:bg-red-50 hover:text-red-700" disabled={busy !== null} onClick={() => setDeleteIds([message.id])}><Trash2 /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && data?.items.length === 0 && <EmptyState activeFilters={activeFilters} />}
        {loading && <LoadingRows />}
      </div>

      <div className="space-y-3 lg:hidden">
        {loading ? <LoadingRows /> : data?.items.map((message) => (
          <article key={message.id} className={`rounded-xl border bg-white p-4 ${selected.has(message.id) ? "border-blue-300 bg-blue-50/40" : "border-zinc-200"}`}>
            <div className="flex items-start gap-3">
              <input type="checkbox" checked={selected.has(message.id)} onChange={() => toggleSelection(message.id)} disabled={busy !== null} aria-label={`选择消息 ${message.id}`} className="mt-1 size-4 rounded border-zinc-300" />
              <button type="button" onClick={() => setEditing(message)} disabled={busy !== null} className="min-w-0 flex-1 text-left disabled:cursor-not-allowed">
                <span className="line-clamp-3 text-sm font-medium leading-6 text-zinc-900">{message.title}</span>
                <span className="mt-2 block text-xs text-zinc-500">{message.channel.title} · {formatTime(message.datetime ?? message.date)}</span>
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${message.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{message.status === "published" ? "公开" : "隐藏"}</span>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${archiveTone(message.archiveStatus)}`}>{archiveLabel(message.archiveStatus)}</span>
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="icon" title="编辑消息" disabled={busy !== null} onClick={() => setEditing(message)}><Pencil /></Button>
                {message.media && <Button variant="ghost" size="icon" title="重试媒体归档" disabled={busy !== null} onClick={() => void retryOne(message)}><RotateCcw /></Button>}
                <Button variant="ghost" size="icon" title="永久删除" className="text-red-600" disabled={busy !== null} onClick={() => setDeleteIds([message.id])}><Trash2 /></Button>
              </div>
            </div>
          </article>
        ))}
        {!loading && data?.items.length === 0 && <div className="rounded-xl border border-zinc-200 bg-white"><EmptyState activeFilters={activeFilters} /></div>}
      </div>

      <div className="flex flex-col gap-3 border-t border-zinc-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500">第 <strong className="font-medium text-zinc-800 tabular-nums">{data?.page ?? page}</strong> / {data?.totalPages ?? 1} 页，每页 30 条</p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={loading || page <= 1} onClick={() => changePage(page - 1)}><ArrowLeft />上一页</Button>
          <Button variant="outline" disabled={loading || page >= (data?.totalPages ?? 1)} onClick={() => changePage(page + 1)}>下一页<ArrowRight /></Button>
        </div>
      </div>

      <EditSheet message={editing} channels={data?.channels ?? []} busy={busy !== null} onOpenChange={(open) => { if (!open) setEditing(null); }} onSave={(body) => editing && patchMessage(editing.id, body, "消息修改已保存，公开站将在下一次请求时读取新内容。")} />

      <Dialog open={deleteIds.length > 0} onOpenChange={(open) => { if (!open && busy === null) setDeleteIds([]); }}>
        <DialogContent>
          <DialogTitle>永久删除 {deleteIds.length > 1 ? `${deleteIds.length} 条消息` : "这条消息"}？</DialogTitle>
          <DialogDescription className="leading-6">
            此操作不可恢复。消息会立即从公开站消失，系统将删除 D1 记录与明确记录的 R2 媒体，并写入墓碑阻止 Telegram 再次同步。
          </DialogDescription>
          <div className="mt-2 flex justify-end gap-3">
            <DialogClose asChild><Button variant="outline" disabled={busy !== null}>取消</Button></DialogClose>
            <Button variant="destructive" disabled={busy !== null} onClick={() => void confirmDelete()}>{busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />}确认永久删除</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ activeFilters }: { activeFilters: boolean }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500"><FileText className="size-5" /></span>
      <p className="mt-4 font-medium text-zinc-900">{activeFilters ? "没有符合条件的消息" : "还没有同步消息"}</p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">{activeFilters ? "调整搜索词或筛选条件后重试。" : "消息只通过 Telegram Webhook 或本地历史回填进入归档。"}</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="flex min-h-56 items-center justify-center text-sm text-zinc-500">
      <Loader2 className="mr-2 size-4 animate-spin" />正在读取消息…
    </div>
  );
}

function EditSheet({
  message,
  channels,
  busy,
  onOpenChange,
  onSave,
}: {
  message: AdminMessage | null;
  channels: AdminChannelOption[];
  busy: boolean;
  onOpenChange(open: boolean): void;
  onSave(body: Record<string, unknown>): void;
}) {
  const [plainText, setPlainText] = useState("");
  const [displayTitle, setDisplayTitle] = useState("");
  const [displaySummary, setDisplaySummary] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [featuredOrder, setFeaturedOrder] = useState(0);
  const [tags, setTags] = useState("");
  const [channelId, setChannelId] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [status, setStatus] = useState<"published" | "hidden">("published");

  useEffect(() => {
    if (!message) return;
    setPlainText(message.plainText);
    setDisplayTitle(message.displayTitle ?? "");
    setDisplaySummary(message.displaySummary ?? "");
    setIsFeatured(message.isFeatured);
    setFeaturedOrder(message.featuredOrder);
    setTags(message.tags.join("，"));
    setChannelId(message.channelId);
    setPublishedAt(inputDate(message.datetime));
    setStatus(message.status);
  }, [message]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onSave({
      plainText,
      displayTitle,
      displaySummary,
      isFeatured,
      featuredOrder,
      tags: tags.split(/[，,\n]/).map((tag) => tag.trim()).filter(Boolean),
      channelId,
      publishedAt,
      status,
    });
  }

  return (
    <Sheet open={Boolean(message)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-zinc-200 bg-zinc-50 p-0 sm:max-w-xl">
        {message && (
          <form onSubmit={submit} className="min-h-full">
            <div className="border-b border-zinc-200 bg-white px-5 py-6 pr-14 sm:px-7">
              <SheetTitle className="text-xl font-semibold text-zinc-950">编辑归档消息</SheetTitle>
              <SheetDescription className="mt-2 leading-6 text-zinc-500">保存后后台版本优先；Telegram 后续编辑不会覆盖正文、标签和发布信息。</SheetDescription>
            </div>
            <div className="space-y-6 px-5 py-6 sm:px-7">
              <section className="rounded-xl bg-zinc-900 p-4 text-white">
                <p className="text-xs text-zinc-400">Telegram 来源（不可修改）</p>
                <p className="mt-2 font-medium">{message.originChannel.title} · @{message.originChannel.username}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                  <span>ID：{message.id}</span><span>消息号：{message.telegramMessageId}</span>
                  <a href={message.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-zinc-200 underline-offset-4 hover:underline">查看原帖<ExternalLink className="size-3" /></a>
                </div>
              </section>

              <section className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">公开站展示信息</h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-600">留空时自动从正文生成。这里只改变内容卡片和详情标题，不锁定 Telegram 正文同步。</p>
                </div>
                <label className="block text-sm font-medium text-zinc-800">展示标题
                  <Input value={displayTitle} onChange={(event) => setDisplayTitle(event.target.value)} maxLength={80} placeholder={message.title} className="mt-2 bg-white" />
                  <span className="mt-1 block text-right text-xs font-normal text-zinc-500 tabular-nums">{displayTitle.length}/80</span>
                </label>
                <label className="block text-sm font-medium text-zinc-800">展示摘要
                  <textarea value={displaySummary} onChange={(event) => setDisplaySummary(event.target.value)} maxLength={240} placeholder={message.summary} className="mt-2 min-h-24 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-6 shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200" />
                  <span className="mt-1 block text-right text-xs font-normal text-zinc-500 tabular-nums">{displaySummary.length}/240</span>
                </label>
                <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-800">
                    <input type="checkbox" checked={isFeatured} onChange={(event) => setIsFeatured(event.target.checked)} className="size-4 rounded border-zinc-300" />设为编辑精选
                  </label>
                  <label className="text-sm font-medium text-zinc-800">精选顺序
                    <Input type="number" min={0} max={9999} value={featuredOrder} onChange={(event) => setFeaturedOrder(Math.max(0, Math.min(9999, Number.parseInt(event.target.value || "0", 10) || 0)))} disabled={!isFeatured} className="mt-2 bg-white" />
                  </label>
                </div>
              </section>

              <label className="block text-sm font-medium text-zinc-800">正文
                <textarea value={plainText} onChange={(event) => setPlainText(event.target.value)} maxLength={10_000} className="mt-2 min-h-56 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm leading-6 shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200" />
                <span className="mt-1 flex justify-between text-xs font-normal text-zinc-500"><span>以纯文本保存并安全转义，换行会保留。</span><span className="tabular-nums">{plainText.length}/10,000</span></span>
              </label>

              <label className="block text-sm font-medium text-zinc-800">标签
                <textarea value={tags} onChange={(event) => setTags(event.target.value)} placeholder="cloudflare，开源项目" className="mt-2 min-h-20 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200" />
                <span className="mt-1 block text-xs font-normal text-zinc-500">使用逗号或换行分隔，最多 30 个；系统会移除 # 并统一小写。</span>
              </label>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block text-sm font-medium text-zinc-800">公开展示频道
                  <select required value={channelId} onChange={(event) => setChannelId(event.target.value)} className={`${selectClass} mt-2 w-full`}>
                    {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.title}{channel.enabled ? "" : "（已停用）"}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium text-zinc-800">发布时间（上海时区）
                  <Input required type="datetime-local" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} className="mt-2" />
                </label>
              </div>

              <fieldset>
                <legend className="text-sm font-medium text-zinc-800">发布状态</legend>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <label className={`cursor-pointer rounded-lg border p-4 text-sm ${statusChoiceClass(status === "published", "published")}`}>
                    <input type="radio" name="status" value="published" checked={status === "published"} onChange={() => setStatus("published")} className="mr-2" />公开展示
                  </label>
                  <label className={`cursor-pointer rounded-lg border p-4 text-sm ${statusChoiceClass(status === "hidden", "hidden")}`}>
                    <input type="radio" name="status" value="hidden" checked={status === "hidden"} onChange={() => setStatus("hidden")} className="mr-2" />隐藏归档
                  </label>
                </div>
              </fieldset>
            </div>
            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-zinc-200 bg-white px-5 py-4 sm:px-7">
              <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button>
              <Button type="submit" disabled={busy} className="bg-zinc-900 text-white hover:bg-zinc-800">{busy ? <Loader2 className="animate-spin" /> : <Save />}{busy ? "正在保存…" : "保存修改"}</Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
