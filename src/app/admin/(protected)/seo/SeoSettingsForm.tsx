"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageUp, Loader2, RotateCcw, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminRequestJson as requestJson } from "@/lib/admin-api";

type SeoSettings = {
  title: string;
  description: string;
  keywords: string[];
  canonicalUrl: string;
  ogImageUrl: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  updatedAt: string | null;
};

type AssetResponse = { key: string; url: string };

function splitKeywords(value: string): string[] {
  return Array.from(new Set(value.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean)));
}

export default function SeoSettingsForm() {
  const ogImageInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<SeoSettings | null>(null);
  const [draft, setDraft] = useState<SeoSettings | null>(null);
  const [keywords, setKeywords] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "error"; text: string } | null>(null);

  const applySettings = (next: SeoSettings) => {
    setSettings(next);
    setDraft(next);
    setKeywords(next.keywords.join("，"));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      applySettings(await requestJson<SeoSettings>("/api/admin/seo-settings"));
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "SEO 设置加载失败" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  async function patchSettings(value: Record<string, unknown>, successText: string, syncDraft = true) {
    const next = await requestJson<SeoSettings>("/api/admin/seo-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    setSettings(next);
    if (syncDraft) {
      setDraft(next);
      setKeywords(next.keywords.join("，"));
    } else {
      setDraft((current) => current ? { ...current, ogImageUrl: next.ogImageUrl, updatedAt: next.updatedAt } : next);
    }
    toast.success(successText);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setBusy("save");
    setNotice(null);
    try {
      await patchSettings(
        {
          title: draft.title,
          description: draft.description,
          keywords: splitKeywords(keywords),
          canonicalUrl: draft.canonicalUrl,
          robotsIndex: draft.robotsIndex,
          robotsFollow: draft.robotsFollow,
        },
        "SEO 设置已保存，搜索引擎在下一次抓取时会读取新元信息。",
      );
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy("og");
    setNotice(null);
    try {
      const form = new FormData();
      form.set("type", "og");
      form.set("file", file);
      const asset = await requestJson<AssetResponse>("/api/admin/site-assets", { method: "POST", body: form });
      await patchSettings({ ogImageKey: asset.key }, "社交分享图已上传并启用；尚未保存的文案草稿已保留。", false);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "上传失败" });
    } finally {
      setBusy(null);
    }
  }

  async function resetOgImage() {
    setBusy("reset-og");
    try {
      await patchSettings({ ogImageKey: null }, "已恢复默认社交分享图；尚未保存的文案草稿已保留。", false);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "恢复失败" });
    } finally {
      setBusy(null);
    }
  }

  if (loading && !settings) {
    return <div className="flex min-h-64 items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm text-zinc-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载 SEO 设置…</div>;
  }
  if (!settings || !draft) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">无法加载 SEO 设置。<Button variant="outline" size="sm" className="ml-3" onClick={() => void load()}>重试</Button></div>;
  }

  const keywordCount = splitKeywords(keywords).length;
  const robotsValue = `${draft.robotsIndex ? "index" : "noindex"}, ${draft.robotsFollow ? "follow" : "nofollow"}`;

  return (
    <form onSubmit={save} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6">
          <h2 className="text-base font-semibold">搜索结果信息</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">用于首页的搜索结果摘要和标准地址。</p>
          <div className="mt-5 space-y-5">
            <label className="block text-sm font-medium text-zinc-800">SEO 标题
              <Input required maxLength={70} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-2" />
              <span className="mt-1 block text-xs text-zinc-500">{draft.title.length}/70 个字符</span>
            </label>
            <label className="block text-sm font-medium text-zinc-800">SEO 描述
              <textarea required maxLength={180} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="mt-2 min-h-28 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200" />
              <span className="mt-1 block text-xs text-zinc-500">{draft.description.length}/180 个字符</span>
            </label>
            <label className="block text-sm font-medium text-zinc-800">关键词
              <textarea value={keywords} onChange={(event) => setKeywords(event.target.value)} className="mt-2 min-h-24 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200" placeholder="极客分享，Telegram 频道，开源项目" />
              <span className={`mt-1 block text-xs ${keywordCount > 30 ? "text-red-600" : "text-zinc-500"}`}>使用逗号或换行分隔，当前 {keywordCount}/30 个</span>
            </label>
            <label className="block text-sm font-medium text-zinc-800">Canonical URL
              <Input type="url" required value={draft.canonicalUrl} onChange={(event) => setDraft({ ...draft, canonicalUrl: event.target.value })} className="mt-2" />
              <span className="mt-1 block text-xs text-zinc-500">生产环境必须使用 HTTPS 绝对地址</span>
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6">
          <h2 className="text-base font-semibold">抓取与分享</h2>
          <div className="mt-5 space-y-5">
            <div>
              <p className="text-sm font-medium text-zinc-800">搜索引擎权限</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex items-start gap-3 rounded-md border border-zinc-200 p-4 text-sm">
                  <input type="checkbox" checked={draft.robotsIndex} onChange={(event) => setDraft({ ...draft, robotsIndex: event.target.checked })} className="mt-0.5 size-4 rounded border-zinc-300" />
                  <span><strong className="block font-medium">允许建立索引</strong><span className="mt-1 block text-xs leading-5 text-zinc-500">关闭后输出 noindex</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-md border border-zinc-200 p-4 text-sm">
                  <input type="checkbox" checked={draft.robotsFollow} onChange={(event) => setDraft({ ...draft, robotsFollow: event.target.checked })} className="mt-0.5 size-4 rounded border-zinc-300" />
                  <span><strong className="block font-medium">允许跟踪链接</strong><span className="mt-1 block text-xs leading-5 text-zinc-500">关闭后输出 nofollow</span></span>
                </label>
              </div>
              <p className="mt-2 text-xs text-zinc-500">当前输出：{robotsValue}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-zinc-800">社交分享图</p>
              <div className="mt-3 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
                <div className="flex aspect-[1.91/1] items-center justify-center bg-white p-3"><img src={settings.ogImageUrl} alt="当前社交分享图" className="size-full object-contain" /></div>
                <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 p-3">
                  <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => ogImageInputRef.current?.click()}><ImageUp />{busy === "og" ? "上传中…" : "上传图片"}</Button>
                  <input ref={ogImageInputRef} className="sr-only" tabIndex={-1} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy !== null} aria-label="选择社交分享图片" onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                  {settings.ogImageUrl !== "/og-image.svg" && <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => void resetOgImage()}><RotateCcw />恢复默认</Button>}
                  <span className="text-xs text-zinc-500">PNG/JPEG/WebP，最大 5 MiB</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {notice && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{notice.text}</div>}
        <div className="flex justify-end"><Button type="submit" disabled={busy !== null || keywordCount > 30} className="bg-zinc-900 text-white hover:bg-zinc-800">{busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}{busy === "save" ? "正在保存…" : "保存 SEO 设置"}</Button></div>
      </div>

      <aside className="self-start xl:sticky xl:top-8" aria-label="搜索结果预览">
        <h2 className="text-sm font-semibold text-zinc-700">搜索结果预览</h2>
        <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-zinc-600"><span className="flex size-6 items-center justify-center rounded-full bg-zinc-100"><Search className="size-3.5" /></span><span className="truncate">{draft.canonicalUrl}</span></div>
          <h3 className="mt-3 text-lg font-medium leading-6 text-blue-700">{draft.title || "SEO 标题"}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{draft.description || "SEO 描述"}</p>
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">实际展示长度由搜索引擎决定，预览用于检查层级和文案。</p>
      </aside>
    </form>
  );
}
