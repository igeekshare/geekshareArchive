import MessageManager from "./MessageManager";

export default function MessagesPage() {
  return (
    <section aria-labelledby="page-title">
      <div>
        <h1 id="page-title" className="text-3xl font-semibold tracking-tight text-zinc-950">内容管理</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          审核 Telegram 已同步内容，调整公开展示信息，处理媒体故障或永久删除归档。
        </p>
      </div>
      <div className="mt-8"><MessageManager /></div>
    </section>
  );
}
