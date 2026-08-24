import type { Metadata } from "next";
import MessageDetailClient from "./MessageDetailClient";

export const metadata: Metadata = {
  title: "消息存档 - 极客分享",
  description: "极客分享 Telegram 频道的持久化消息存档。",
};

export default function MessagePage() {
  return <MessageDetailClient />;
}
