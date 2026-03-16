import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Home as HomeIcon } from "lucide-react";
import messagesData from "@/data/messages.json";
import MessageCard from "@/components/MessageCard";

// Define message types locally to avoid import circularity if any
interface Reaction {
  emoji: string;
  count: string;
}

interface Media {
  type: "photo" | "video" | "file";
  url: string;
  thumb?: string;
  width?: string;
  height?: string;
  title?: string;
  description?: string;
}

interface Message {
  id: string;
  date: string;
  from: string;
  text: string;
  media?: Media | null;
  replyTo?: string | null;
  reactions?: Reaction[] | null;
}

const allMessages = messagesData as Message[];

// Static Generation: Tell Next.js which paths to pre-render
export async function generateStaticParams() {
  return allMessages.map((msg) => ({
    id: msg.id,
  }));
}

// SEO Metadata
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const message = allMessages.find((m) => m.id === params.id);

  if (!message) {
    return {
      title: "消息未找到 - 极客分享",
    };
  }

  // Clean text for description (remove HTML tags)
  const plainText = message.text?.replace(/<[^>]*>/g, "").substring(0, 150) || "极客分享 Telegram 频道存档消息";

  return {
    title: `消息 ${message.id} - 极客分享`,
    description: plainText,
    openGraph: {
      title: `极客分享 - 消息存档 #${message.id}`,
      description: plainText,
      type: "article",
      publishedTime: message.date,
    },
  };
}

export default function MessagePage({ params }: { params: { id: string } }) {
  const message = allMessages.find((m) => m.id === params.id);

  if (!message) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto py-4">
      {/* Navigation Header */}
      <nav className="flex items-center justify-between mb-2">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-blue-500 transition-colors group"
        >
          <div className="p-2 rounded-full group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </div>
          返回列表
        </Link>

        <Link
          href="/"
          className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
          title="前往首页"
        >
          <HomeIcon className="w-5 h-5" />
        </Link>
      </nav>

      {/* The Actual Message */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <MessageCard
          id={message.id}
          date={message.date}
          from={message.from}
          text={message.text}
          media={message.media}
          replyTo={message.replyTo}
          reactions={message.reactions}
        />
      </div>

      {/* Bottom Context Info */}
      <footer className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800 text-center">
        <p className="text-xs text-zinc-400 mb-4">
          这条消息是极客分享 Telegram 频道存档的一部分。
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
        >
          浏览更多分享
        </Link>
      </footer>
    </div>
  );
}
