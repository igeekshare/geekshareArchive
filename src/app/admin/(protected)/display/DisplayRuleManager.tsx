"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, EyeOff, Hash, Loader2, Plus, TextSearch, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminRequestJson as api } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type DisplayRule = {
  id: number;
  type: "tag" | "keyword";
  value: string;
  matchCount: number;
  createdBy: string | null;
  createdAt: string;
};

function formatTime(value: string): string {
  const utcValue = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const date = new Date(utcValue);
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

function ruleLabel(rule: DisplayRule): string {
  return rule.type === "tag" ? `#${rule.value}` : rule.value;
}

export default function DisplayRuleManager() {
  const [rules, setRules] = useState<DisplayRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"tag" | "keyword" | "delete" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DisplayRule | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRules(await api<DisplayRule[]>("/api/admin/display-rules"));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "展示规则加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void loadRules(), [loadRules]);

  async function addRule(event: React.FormEvent<HTMLFormElement>, type: DisplayRule["type"]) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = String(new FormData(form).get("value") ?? "").trim();
    if (!value) return;
    setBusy(type);
    setNotice(null);
    try {
      await api<DisplayRule>("/api/admin/display-rules", {
        method: "POST",
        body: JSON.stringify({ type, value }),
      });
      form.reset();
      toast.success(type === "tag" ? "标签屏蔽规则已生效。" : "关键词屏蔽规则已生效。");
      await loadRules();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "规则添加失败");
    } finally {
      setBusy(null);
    }
  }

  async function deleteRule() {
    if (!deleteTarget) return;
    setBusy("delete");
    setNotice(null);
    try {
      await api(`/api/admin/display-rules/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(`规则“${ruleLabel(deleteTarget)}”已移除；不再命中其他规则的公开推文已恢复展示。`);
      setDeleteTarget(null);
      await loadRules();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "规则删除失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
        <EyeOff className="mt-1 size-4 shrink-0" aria-hidden="true" />
        <p>
          命中规则的推文仅从公开站隐藏，仍可在内容管理中查看和编辑。移除规则后，状态为“公开”且不再命中其他规则的推文会立即恢复展示。
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white" aria-labelledby="add-rule-title">
        <div className="border-b border-zinc-200 px-5 py-4 sm:px-6">
          <h2 id="add-rule-title" className="font-semibold text-zinc-950">添加屏蔽规则</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">标签按完整标签匹配；关键词在正文中忽略英文大小写进行包含匹配。</p>
        </div>
        <div className="grid md:grid-cols-2">
          <form aria-busy={busy === "tag"} onSubmit={(event) => void addRule(event, "tag")} className="space-y-4 border-b border-zinc-200 p-5 sm:p-6 md:border-b-0 md:border-r">
            <div className="flex items-center gap-2">
              <Hash className="size-4 text-zinc-500" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-zinc-900">屏蔽标签</h3>
            </div>
            <label className="block text-sm font-medium text-zinc-800">
              标签名称
              <Input name="value" required maxLength={65} placeholder="#广告" autoComplete="off" className="mt-2" />
              <span className="mt-2 block text-xs font-normal leading-5 text-zinc-500">可输入带或不带 # 的标签；不会匹配名称相近的其他标签。</span>
            </label>
            <Button type="submit" disabled={busy !== null} className="bg-zinc-900 text-white hover:bg-zinc-800">
              {busy === "tag" ? <Loader2 className="animate-spin" /> : <Plus />}
              {busy === "tag" ? "正在添加…" : "添加标签规则"}
            </Button>
          </form>

          <form aria-busy={busy === "keyword"} onSubmit={(event) => void addRule(event, "keyword")} className="space-y-4 p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <TextSearch className="size-4 text-zinc-500" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-zinc-900">屏蔽关键词</h3>
            </div>
            <label className="block text-sm font-medium text-zinc-800">
              正文关键词
              <Input name="value" required maxLength={100} placeholder="推广内容" autoComplete="off" className="mt-2" />
              <span className="mt-2 block text-xs font-normal leading-5 text-zinc-500">只要正文包含该连续文本就会命中；例如 ads 也会匹配 ADS。</span>
            </label>
            <Button type="submit" disabled={busy !== null} className="bg-zinc-900 text-white hover:bg-zinc-800">
              {busy === "keyword" ? <Loader2 className="animate-spin" /> : <Plus />}
              {busy === "keyword" ? "正在添加…" : "添加关键词规则"}
            </Button>
          </form>
        </div>
      </section>

      {notice && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {loadError && rules.length > 0 && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span>规则刷新失败：{loadError}。以下仍显示上次成功读取的结果。</span>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadRules()} className="shrink-0 border-amber-200 bg-white">
            重新加载
          </Button>
        </div>
      )}

      <section aria-busy={loading} className="overflow-hidden rounded-xl border border-zinc-200 bg-white" aria-labelledby="rule-list-title">
        <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4 sm:px-6">
          <div>
            <h2 id="rule-list-title" className="font-semibold text-zinc-950">当前规则</h2>
            <p className="mt-1 text-sm text-zinc-500">规则按创建时间排列，命中数量随内容和规则实时计算。</p>
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-600">
            {loadError && rules.length === 0 ? "暂不可用" : `${rules.length} 条`}
          </span>
        </div>

        {loading && rules.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-zinc-500" aria-live="polite">
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />正在读取规则…
          </div>
        ) : loadError && rules.length === 0 ? (
          <div role="alert" className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center">
            <AlertTriangle className="size-7 text-amber-600" aria-hidden="true" />
            <p className="mt-4 font-medium text-zinc-900">展示规则读取失败</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">{loadError}</p>
            <Button type="button" variant="outline" className="mt-5" disabled={loading} onClick={() => void loadRules()}>
              重新加载
            </Button>
          </div>
        ) : rules.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center">
            <EyeOff className="size-7 text-zinc-400" aria-hidden="true" />
            <p className="mt-4 font-medium text-zinc-900">还没有展示屏蔽规则</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">添加标签或关键词后，匹配内容会立即从公开站隐藏。</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200" aria-label="展示屏蔽规则列表">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md ${rule.type === "tag" ? "bg-blue-50 text-blue-700" : "bg-zinc-100 text-zinc-600"}`}>
                    {rule.type === "tag" ? <Hash className="size-4" aria-hidden="true" /> : <TextSearch className="size-4" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-zinc-500">{rule.type === "tag" ? "标签" : "关键词"}</span>
                      <strong className="break-all text-sm font-semibold text-zinc-950">{ruleLabel(rule)}</strong>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      当前屏蔽 <span className="font-semibold tabular-nums text-red-700">{rule.matchCount}</span> 条公开推文
                      <span aria-hidden="true"> · </span>{formatTime(rule.createdAt)} 添加
                    </p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => setDeleteTarget(rule)} className="self-end text-red-600 hover:bg-red-50 hover:text-red-700 sm:self-auto">
                  <Trash2 />移除规则
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && busy === null) setDeleteTarget(null); }}>
        <DialogContent aria-busy={busy === "delete"}>
          <DialogTitle>移除“{deleteTarget ? ruleLabel(deleteTarget) : ""}”规则？</DialogTitle>
          <DialogDescription className="leading-6">
            这不会删除任何归档。状态为“公开”且不再命中其他屏蔽规则的推文将恢复展示；仍处于单条“隐藏”状态或命中其他规则的推文不会恢复。
          </DialogDescription>
          <div className="mt-2 flex justify-end gap-3">
            <DialogClose asChild><Button variant="outline" disabled={busy !== null}>取消</Button></DialogClose>
            <Button variant="destructive" disabled={busy !== null} onClick={() => void deleteRule()}>
              {busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {busy === "delete" ? "正在移除…" : "确认移除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
