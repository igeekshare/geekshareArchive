import SeoSettingsForm from "./SeoSettingsForm";

export default function SeoPage() {
  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title" className="text-3xl font-semibold tracking-tight text-zinc-950">SEO 设置</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">控制首页的搜索结果摘要、社交分享信息和搜索引擎抓取策略。</p>
      <div className="mt-8"><SeoSettingsForm /></div>
    </section>
  );
}
