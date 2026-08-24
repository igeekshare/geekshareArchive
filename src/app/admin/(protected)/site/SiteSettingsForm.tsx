"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ImageUp, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminRequestJson as requestJson } from "@/lib/admin-api";

type SiteSettings = {
  siteName: string;
  homepageTitle: string;
  description: string;
  logoUrl: string | null;
  faviconUrl: string;
  updatedAt: string | null;
};

type AssetResponse = { key: string; url: string };

const textareaClass =
  "mt-2 min-h-28 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200";

export default function SiteSettingsForm() {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [draft, setDraft] = useState<Pick<SiteSettings, "siteName" | "homepageTitle" | "description"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await requestJson<SiteSettings>("/api/admin/site-settings");
      setSettings(next);
      setDraft({ siteName: next.siteName, homepageTitle: next.homepageTitle, description: next.description });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "站点设置加载失败" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  async function patchSettings(value: Record<string, unknown>, successText: string, syncDraft = false) {
    setNotice(null);
    const next = await requestJson<SiteSettings>("/api/admin/site-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    setSettings(next);
    if (syncDraft) {
      setDraft({ siteName: next.siteName, homepageTitle: next.homepageTitle, description: next.description });
    }
    setNotice({ tone: "success", text: successText });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setBusy("save");
    try {
      await patchSettings(
        {
          siteName: draft.siteName,
          homepageTitle: draft.homepageTitle,
          description: draft.description,
        },
        "站点信息已保存，前台下一次请求即可看到更新。",
        true,
      );
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setBusy(null);
    }
  }

  async function upload(type: "logo" | "favicon", file: File | undefined) {
    if (!file) return;
    setBusy(type);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("type", type);
      form.set("file", file);
      const asset = await requestJson<AssetResponse>("/api/admin/site-assets", {
        method: "POST",
        body: form,
      });
      await patchSettings(
        type === "logo" ? { logoKey: asset.key } : { faviconKey: asset.key },
        type === "logo" ? "Logo 已上传并启用。" : "Favicon 已上传并启用。",
      );
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "上传失败" });
    } finally {
      setBusy(null);
    }
  }

  async function resetAsset(type: "logo" | "favicon") {
    setBusy(`reset-${type}`);
    try {
      await patchSettings(
        type === "logo" ? { logoKey: null } : { faviconKey: null },
        type === "logo" ? "已恢复默认文字标识。" : "已恢复默认 Favicon。",
      );
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "恢复失败" });
    } finally {
      setBusy(null);
    }
  }

  if (loading && !settings) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm text-zinc-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载站点设置…
      </div>
    );
  }

  if (!settings || !draft) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        无法加载站点设置。<Button variant="outline" size="sm" className="ml-3" onClick={() => void load()}>重试</Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <form onSubmit={save} className="space-y-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6">
          <h2 className="text-base font-semibold">品牌文字</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">用于前台页头和首页介绍，SEO 文案在独立页面维护。</p>
          <div className="mt-5 space-y-5">
            <label className="block text-sm font-medium text-zinc-800">
              站点名称
              <Input name="siteName" required maxLength={60} value={draft.siteName} onChange={(event) => setDraft({ ...draft, siteName: event.target.value })} className="mt-2" />
              <span className="mt-1 block text-xs text-zinc-500">1–60 个字符</span>
            </label>
            <label className="block text-sm font-medium text-zinc-800">
              首页标题
              <Input name="homepageTitle" required maxLength={100} value={draft.homepageTitle} onChange={(event) => setDraft({ ...draft, homepageTitle: event.target.value })} className="mt-2" />
              <span className="mt-1 block text-xs text-zinc-500">首页首屏的主要标题，最多 100 个字符</span>
            </label>
            <label className="block text-sm font-medium text-zinc-800">
              站点简介
              <textarea name="description" maxLength={300} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={textareaClass} />
              <span className="mt-1 block text-xs text-zinc-500">最多 300 个字符</span>
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6">
          <h2 className="text-base font-semibold">品牌图片</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">图片上传后立即启用；旧对象会保留在 R2 中。</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex min-h-20 items-center justify-center rounded-md bg-white p-3">
                {settings.logoUrl ? <img src={settings.logoUrl} alt="当前站点 Logo" className="max-h-14 max-w-full object-contain" /> : <span className="flex size-12 items-center justify-center rounded-full bg-red-500 text-lg font-bold text-white">{draft.siteName.charAt(0)}</span>}
              </div>
              <p className="mt-3 text-sm font-medium">Logo</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">PNG/JPEG/WebP，最大 2 MiB。</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => logoInputRef.current?.click()}><ImageUp />{busy === "logo" ? "上传中…" : "上传 Logo"}</Button>
                <input ref={logoInputRef} className="sr-only" tabIndex={-1} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy !== null} aria-label="选择 Logo 图片" onChange={(event) => { void upload("logo", event.target.files?.[0]); event.currentTarget.value = ""; }} />
                {settings.logoUrl && <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => void resetAsset("logo")}><RotateCcw />恢复默认</Button>}
              </div>
            </div>

            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex min-h-20 items-center justify-center rounded-md bg-white p-3">
                <img src={settings.faviconUrl} alt="当前 Favicon" className="size-12 object-contain" />
              </div>
              <p className="mt-3 text-sm font-medium">Favicon</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">PNG/ICO，最大 512 KiB。</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => faviconInputRef.current?.click()}><ImageUp />{busy === "favicon" ? "上传中…" : "上传 Favicon"}</Button>
                <input ref={faviconInputRef} className="sr-only" tabIndex={-1} type="file" accept="image/png,image/x-icon,.ico" disabled={busy !== null} aria-label="选择 Favicon 图片" onChange={(event) => { void upload("favicon", event.target.files?.[0]); event.currentTarget.value = ""; }} />
                {settings.faviconUrl !== "/favicon.svg" && <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => void resetAsset("favicon")}><RotateCcw />恢复默认</Button>}
              </div>
            </div>
          </div>
        </section>

        {notice && (
          <div role={notice.tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-md border px-4 py-3 text-sm ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {notice.tone === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}{notice.text}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={busy !== null} className="bg-zinc-900 text-white hover:bg-zinc-800">
            {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}{busy === "save" ? "正在保存…" : "保存站点信息"}
          </Button>
        </div>
      </form>

      <aside className="self-start xl:sticky xl:top-8" aria-label="站点预览">
        <h2 className="text-sm font-semibold text-zinc-700">即时预览</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3">
            {settings.logoUrl ? <img src={settings.logoUrl} alt="" className="size-9 rounded-md object-contain" /> : <span className="flex size-9 items-center justify-center rounded-full bg-red-500 font-bold text-white">{draft.siteName.charAt(0)}</span>}
            <strong className="truncate text-sm">{draft.siteName}</strong>
          </div>
          <div className="p-5">
            <h3 className="text-xl font-bold leading-7 text-zinc-950">{draft.homepageTitle}</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-600">{draft.description || "未填写站点简介"}</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">预览会随文字输入更新；点击保存后才会应用到公开站点。</p>
      </aside>
    </div>
  );
}
