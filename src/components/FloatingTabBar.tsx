"use client";

type IconProps = {
  className?: string;
};

function GlobeIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" strokeLinecap="round" />
      <path d="M12 3v18" strokeLinecap="round" />
      <path
        d="M7 5.5c1.5.8 3.2 1.2 5 1.2s3.5-.4 5-1.2M7 18.5c1.5-.8 3.2-1.2 5-1.2s3.5.4 5 1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function FloatingTabBar() {
  return (
    <nav
      aria-label="悬浮导航"
      className="fixed inset-x-0 bottom-4 sm:bottom-6 z-50 flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto flex flex-row items-stretch gap-2 rounded-full border border-zinc-200/60 dark:border-zinc-800/60 bg-white/85 dark:bg-zinc-900/80 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/70 supports-[backdrop-filter]:dark:bg-zinc-900/70">
        <a
          href="https://geekshare.org/"
          target="_blank"
          rel="noopener noreferrer"
          title="官网"
          className="group inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/70 transition-colors"
        >
          <GlobeIcon className="h-5 w-5 opacity-90 group-hover:opacity-100" />
          <span>官网</span>
        </a>

        <a
          href="https://t.me/xgeekshare"
          target="_blank"
          rel="noopener noreferrer"
          title="极客分享2.0"
          className="group inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/70 transition-colors"
        >
          {/* Telegram official brand SVG via CDN (primary) with local fallback */}
          <img
            src="https://cdn.simpleicons.org/telegram/26A5E4"
            alt=""
            aria-hidden="true"
            className="h-5 w-5 opacity-90 group-hover:opacity-100"
            width={20}
            height={20}
            decoding="async"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "/telegram.svg";
            }}
          />
          <span>极客分享2.0</span>
        </a>
      </div>
    </nav>
  );
}
