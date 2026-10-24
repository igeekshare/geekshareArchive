import DisplayRuleManager from "./DisplayRuleManager";

export default function DisplayPage() {
  return (
    <section aria-labelledby="page-title">
      <div>
        <h1 id="page-title" className="text-3xl font-semibold tracking-tight text-zinc-950">
          展示管理
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          按标签或正文关键词控制公开站内容。规则同时作用于已有归档和之后同步的推文，不会删除原始数据。
        </p>
      </div>
      <div className="mt-8">
        <DisplayRuleManager />
      </div>
    </section>
  );
}
