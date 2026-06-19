"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  Globe2,
  LayoutDashboard,
  LogOut,
  RadioTower,
  SearchCheck,
  Settings,
} from "lucide-react";
import { logoutAction } from "../actions";

const navigation = [
  { href: "/admin", label: "概览", icon: LayoutDashboard },
  { href: "/admin/channels", label: "频道管理", icon: RadioTower },
  { href: "/admin/messages", label: "内容管理", icon: FileText },
  { href: "/admin/sync", label: "同步管理", icon: SearchCheck },
  { href: "/admin/seo", label: "SEO 设置", icon: Globe2 },
  { href: "/admin/site", label: "站点设置", icon: Settings },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return <div className="min-h-dvh bg-zinc-100">{children}</div>;
  }

  return (
    <div className="min-h-dvh bg-zinc-100 text-zinc-950">
      <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-4 lg:hidden">
        <div>
          <p className="text-sm font-semibold">GeekShare</p>
          <p className="text-xs text-zinc-500">管理后台</p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
            title="退出登录"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">退出登录</span>
          </button>
        </form>
      </header>

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex h-20 items-center border-b border-zinc-200 px-6">
          <div>
            <p className="text-base font-semibold">GeekShare</p>
            <p className="mt-1 text-xs text-zinc-500">管理后台</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="后台导航">
          {navigation.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href ||
              (href !== "/admin" && pathname.startsWith(`${href}/`));

            return (
              <Link
                key={href}
                href={href}
                className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-zinc-200 p-3">
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              退出登录
            </button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-64">
        <nav
          className="flex gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-3 py-2 lg:hidden"
          aria-label="后台导航"
        >
          {navigation.map(({ href, label }) => {
            const isActive =
              pathname === href ||
              (href !== "/admin" && pathname.startsWith(`${href}/`));

            return (
              <Link
                key={href}
                href={href}
                className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
          {children}
        </main>
      </div>
    </div>
  );
}
