import ChannelManager from "./ChannelManager";

export default function ChannelsPage() {
  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title" className="text-3xl font-semibold tracking-tight text-zinc-950">频道管理</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
        接入多个 Telegram 频道，检查共享 Bot 权限，并控制是否继续接收新推送。
      </p>
      <div className="mt-8"><ChannelManager /></div>
    </section>
  );
}
