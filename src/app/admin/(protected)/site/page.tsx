import SiteSettingsForm from "./SiteSettingsForm";

export default function SitePage() {
  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title" className="text-3xl font-semibold tracking-tight text-zinc-950">站点设置</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">维护公开站点的名称、首页介绍和品牌图片。保存后无需重新部署。</p>
      <div className="mt-8"><SiteSettingsForm /></div>
    </section>
  );
}
