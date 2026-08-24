import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "管理员登录 | GeekShare",
};

export default function AdminEntryPage() {
  return (
    <main className="min-h-dvh bg-zinc-100 px-4 py-5 text-zinc-950 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white sm:min-h-[calc(100dvh-4rem)]">
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 sm:px-8">
          <Link href="/" className="group inline-flex min-h-11 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm transition-colors group-hover:bg-red-700">
              <Archive className="size-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-tight">GeekShare</span>
              <span className="block text-xs text-zinc-500">Telegram 持久化归档</span>
            </span>
          </Link>
          <span className="hidden items-center gap-2 text-xs font-medium text-zinc-500 sm:inline-flex">
            <ShieldCheck className="size-4 text-emerald-600" aria-hidden="true" />
            受保护的管理入口
          </span>
        </header>

        <div className="grid flex-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
          <section className="flex flex-col justify-center px-6 py-12 sm:px-12 sm:py-16 lg:px-16" aria-labelledby="admin-entry-title">
            <div className="flex size-12 items-center justify-center rounded-xl bg-zinc-950 text-white shadow-sm">
              <LockKeyhole className="size-5" aria-hidden="true" />
            </div>
            <h1 id="admin-entry-title" className="mt-8 max-w-xl text-balance text-4xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-5xl">
              管理入口，留给维护归档的人。
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-zinc-600">
              频道、内容、同步和站点设置仅向管理员开放。公开归档无需账户，访客可以继续自由浏览和搜索。
            </p>

            <dl className="mt-10 grid max-w-2xl gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2">
              <div className="bg-zinc-50 px-5 py-4">
                <dt className="text-xs font-medium text-zinc-500">身份验证</dt>
                <dd className="mt-1.5 text-sm font-semibold text-zinc-900">Cloudflare Access 邮箱验证码</dd>
              </div>
              <div className="bg-zinc-50 px-5 py-4">
                <dt className="text-xs font-medium text-zinc-500">访问范围</dt>
                <dd className="mt-1.5 text-sm font-semibold text-zinc-900">仅限单一站点管理员</dd>
              </div>
            </dl>
          </section>

          <aside className="flex flex-col justify-center border-t border-zinc-200 bg-zinc-50 px-6 py-10 sm:px-10 lg:border-l lg:border-t-0" aria-label="管理员登录操作">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-950">进入管理后台</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              点击后将前往 Cloudflare Access。验证码和登录状态不会由本站保存。
            </p>
            <Button asChild size="lg" className="mt-7 h-11 w-full justify-between px-4">
              <Link href="/admin/dashboard/">
                使用邮箱验证码登录
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Link
              href="/"
              className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              返回公开归档
            </Link>
            <p className="mt-8 border-t border-zinc-200 pt-5 text-xs leading-5 text-zinc-500">
              如果你不是站点管理员，无需在此登录。公开内容不会因后台权限设置而要求注册。
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
