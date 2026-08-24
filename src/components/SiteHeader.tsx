"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Menu, Moon, Search, Send, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PublicBrandingSettings } from "@/lib/site-config";

const navItems = [
  { label: "首页", href: "/" },
  { label: "频道", href: "/#channel" },
  { label: "话题", href: "/#topics" },
  { label: "关于", href: "/#about" },
];

type SiteHeaderProps = {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: (value: string) => void;
  branding?: PublicBrandingSettings;
  telegramUrl?: string;
  className?: string;
};

function HeaderSearch({
  value,
  onChange,
  onSubmit,
  inputRef,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        aria-label="搜索归档"
        placeholder="搜索消息、关键词、话题..."
        className="h-9 rounded-lg bg-muted/45 pl-9 pr-12 shadow-none focus-visible:bg-background"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
        ⌘K
      </kbd>
    </form>
  );
}

export default function SiteHeader({ searchValue, onSearchChange, onSearchSubmit, branding, telegramUrl, className }: SiteHeaderProps) {
  const [localSearch, setLocalSearch] = useState(searchValue ?? "");
  const [mounted, setMounted] = useState(false);
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const value = searchValue ?? localSearch;
  const siteName = branding?.siteName ?? "极客分享";
  const initial = siteName.charAt(0) || "极";

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (searchValue !== undefined) setLocalSearch(searchValue);
  }, [searchValue]);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const target = window.matchMedia("(min-width: 768px)").matches
          ? desktopSearchRef.current
          : mobileSearchRef.current;
        target?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const setSearch = (next: string) => {
    setLocalSearch(next);
    onSearchChange?.(next);
  };
  const submitSearch = (next: string) => {
    if (onSearchSubmit) onSearchSubmit(next);
    else window.location.assign(next.trim() ? `/?q=${encodeURIComponent(next.trim())}` : "/");
  };

  return (
    <header className={cn("site-header sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85", className)}>
      <div className="mx-auto flex h-[60px] max-w-[1276px] items-center gap-5 px-4 min-[1300px]:px-0">
        <a href="/" className="flex shrink-0 items-center gap-2.5" aria-label={`${siteName}首页`}>
          {branding?.logoUrl ? <img src={branding.logoUrl} alt="" className="size-9 rounded-md object-contain" /> : <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-red-400 to-red-600 text-base font-bold text-white shadow-sm">{initial}</span>}
          <span className="home-brand max-w-36 truncate">{siteName}</span>
          <Badge className="hidden border-0 bg-red-50 text-xs font-medium text-primary hover:bg-red-50 sm:inline-flex dark:bg-red-950/40">
            Telegram 同步
          </Badge>
        </a>

        <nav aria-label="主导航" className="hidden h-full items-center gap-1 lg:flex">
          {navItems.map((item, index) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "home-nav relative inline-flex h-full items-center px-3 text-muted-foreground transition-colors hover:text-foreground",
                index === 0 && "text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary",
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <HeaderSearch
          inputRef={desktopSearchRef}
          className="mx-auto hidden w-full max-w-[340px] md:block"
          value={value}
          onChange={setSearch}
          onSubmit={submitSearch}
        />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={resolvedTheme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              >
                {mounted && resolvedTheme === "dark" ? <Sun /> : <Moon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>切换主题</TooltipContent>
          </Tooltip>
          {telegramUrl && <Button asChild variant="telegram" className="hidden sm:inline-flex"><a href={telegramUrl} target="_blank" rel="noreferrer"><Send />打开 Telegram</a></Button>}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden" aria-label="打开导航"><Menu /></Button>
            </SheetTrigger>
            <SheetContent className="flex flex-col">
              <SheetTitle className="flex items-center gap-2 text-lg font-bold">
                {branding?.logoUrl ? <img src={branding.logoUrl} alt="" className="size-8 rounded-md object-contain" /> : <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{initial}</span>}{siteName}
              </SheetTitle>
              <SheetDescription>{branding?.description ?? "Telegram 频道内容的永久归档。"}</SheetDescription>
              <nav className="mt-5 flex flex-col gap-1" aria-label="移动端导航">
                {navItems.map((item) => (
                  <SheetClose asChild key={item.href}>
                    <a href={item.href} className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-accent">{item.label}</a>
                  </SheetClose>
                ))}
              </nav>
              {telegramUrl && <Button asChild variant="telegram" className="mt-auto"><a href={telegramUrl} target="_blank" rel="noreferrer"><Send />打开 Telegram</a></Button>}
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <div className="border-t px-4 pb-2 pt-2 md:hidden">
        <HeaderSearch inputRef={mobileSearchRef} value={value} onChange={setSearch} onSubmit={submitSearch} />
      </div>
    </header>
  );
}
