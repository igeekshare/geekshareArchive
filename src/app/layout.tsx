import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import FloatingTabBar from "@/components/FloatingTabBar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://archive.geekshare.org"),
  title: "极客分享 | 优质网站工具APP开源项目每日更新 | @geekshare",

  description:
    "精选优质网站、实用工具与开源项目，聚合 AI 与效率应用、编程与科技资源，每日更新。关注 @geekshare，发现好用、好玩、开源与免费资源，覆盖网站、App 与黑科技，助你高效创作与学习。",
  alternates: { canonical: "https://archive.geekshare.org" },
  openGraph: {
    title: "极客分享 | 优质网站工具APP开源项目每日更新 | @geekshare",
    description:
      "精选优质网站、实用工具与开源项目，聚合 AI 与效率应用、编程与科技资源，每日更新。关注 @geekshare，发现好用、好玩、开源与免费资源，覆盖网站、App 与黑科技，助你高效创作与学习。",
    url: "https://archive.geekshare.org",
    siteName: "极客分享 (GeekShare)",
    type: "website",
    locale: "zh_CN",
    images: ["/og-image.svg"],
  },

  twitter: {
    card: "summary_large_image",

    title: "极客分享 | 优质网站工具APP开源项目每日更新 | @geekshare",

    description:
      "精选优质网站、实用工具与开源项目，聚合 AI 与效率应用、编程与科技资源，每日更新。关注 @geekshare，发现好用、好玩、开源与免费资源，覆盖网站、App 与黑科技，助你高效创作与学习。",

    images: ["/og-image.svg"],
  },

  robots: {
    index: true,
    follow: true,
  },

  keywords: [
    "极客分享",
    "geekshare",
    "t.me/geekshare",
    "telegram极客分享",
    "优质网站推荐",
    "实用工具分享",
    "开源项目推荐",
    "AI工具",
    "效率软件",
    "黑科技",
    "APP推荐",
    "免费资源",
    "科技资源",
    "编程工具",
    "开源软件",
    "网站收藏",
    "好玩应用",
    "每日更新",
    "极客资源",
    "工具合集",
    "资源导航",
    "telegram频道推荐",
    "中文科技分享",
    "geek工具",
    "效率提升工具",
    "黑苹果",
    "破解资源",
  ],
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${inter.className} antialiased bg-zinc-50 dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100`}
      >
        <main className="min-h-screen max-w-4xl mx-auto px-4 py-8">
          {children}
        </main>

        <FloatingTabBar />
      </body>
    </html>
  );
}
