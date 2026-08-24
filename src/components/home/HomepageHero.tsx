import { Archive, Hash, RadioTower } from "lucide-react";
import type { HomepageStats } from "@/lib/messages";
import type { PublicBrandingSettings } from "@/lib/site-config";
import AnimatedNumber from "@/components/AnimatedNumber";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomepageHero({
  stats,
  branding,
  loading,
}: {
  stats: HomepageStats | null;
  branding: PublicBrandingSettings;
  loading: boolean;
}) {
  return (
    <section id="about" className="flex flex-col gap-4 rounded-2xl bg-slate-950 px-5 py-5 text-white shadow-[0_14px_36px_-28px_rgba(15,23,42,0.9)] sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-6">
      <div className="max-w-2xl">
        <h1 className="text-balance text-[1.45rem] font-extrabold leading-tight tracking-[-0.025em] sm:text-[1.8rem]">
          {branding.homepageTitle}
        </h1>
        <p className="mt-2 max-w-[68ch] text-sm leading-6 text-slate-300">
          {branding.description}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 text-xs text-slate-300 sm:gap-4" aria-label="归档规模">
        {loading ? (
          <Skeleton className="h-8 w-52 bg-white/10" />
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5"><Archive className="size-3.5 text-blue-400" /><AnimatedNumber value={stats?.messageCount ?? 0} /> 条</span>
            <span className="h-3 w-px bg-white/15" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5"><Hash className="size-3.5 text-red-400" /><AnimatedNumber value={stats?.tagCount ?? 0} /> 个话题</span>
            <span className="h-3 w-px bg-white/15" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5"><RadioTower className="size-3.5 text-blue-400" /><AnimatedNumber value={stats?.channelCount ?? 0} /> 个频道</span>
          </>
        )}
      </div>
    </section>
  );
}
