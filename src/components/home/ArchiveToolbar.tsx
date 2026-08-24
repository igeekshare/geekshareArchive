import { CalendarDays, ChevronDown, Filter, Hash, RotateCcw } from "lucide-react";
import type { MessageCategory, MessageSort } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const categories: Array<{ value: MessageCategory; label: string }> = [
  { value: "all", label: "全部" },
  { value: "visual", label: "图文" },
  { value: "link", label: "链接" },
  { value: "interactive", label: "互动" },
  { value: "file", label: "文件" },
];

const sortLabels: Record<MessageSort, string> = {
  newest: "最新",
  hot: "本周热门",
  featured: "编辑精选",
  oldest: "最早",
};

type ArchiveToolbarProps = {
  category: MessageCategory;
  sort: MessageSort;
  tags: Array<{ tag: string; count: number }>;
  years: string[];
  monthsByYear: Record<string, string[]>;
  activeTag: string | null;
  activeYear: string | null;
  activeMonth: string | null;
  onCategoryChange: (value: MessageCategory) => void;
  onSortChange: (value: MessageSort) => void;
  onTagChange: (value: string | null) => void;
  onYearChange: (value: string | null) => void;
  onMonthChange: (value: string | null) => void;
  onReset: () => void;
};

export default function ArchiveToolbar(props: ArchiveToolbarProps) {
  const filterActive = Boolean(props.activeTag || props.activeYear || props.activeMonth);
  const availableMonths = Array.from(
    new Set(
      (props.activeYear
        ? props.monthsByYear[props.activeYear] ?? []
        : Object.values(props.monthsByYear).flat()
      ).map((value) => value.slice(-2)),
    ),
  ).sort();

  return (
    <Card className="flex min-h-[52px] items-center justify-between gap-2 overflow-hidden rounded-xl px-2 py-2 shadow-none sm:px-3">
      <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto">
        {categories.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => props.onCategoryChange(item.value)}
            className={cn("home-control h-8 shrink-0 rounded-md px-3 font-medium transition sm:px-4", props.category === item.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="px-2.5 font-normal sm:px-3">{sortLabels[props.sort]}<ChevronDown /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={props.sort} onValueChange={(value) => props.onSortChange(value as MessageSort)}>
              <DropdownMenuRadioItem value="newest">最新内容</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="hot">本周热门</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="featured">编辑精选</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="oldest">最早内容</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" aria-label="内容筛选" className={cn("px-2.5 font-normal sm:px-3", filterActive && "border-primary text-primary")}>
              <Filter /><span className="hidden sm:inline">筛选</span>{filterActive && <span className="size-1.5 rounded-full bg-primary" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[340px] max-w-[calc(100vw-2rem)] space-y-5">
            <section>
              <h3 className="home-supporting mb-2 flex items-center gap-2 font-semibold"><Hash className="size-3.5 text-muted-foreground" />话题标签</h3>
              <div className="max-h-28 overflow-y-auto pr-1">
                <div className="flex flex-wrap gap-1.5">
                  {props.tags.map(({ tag, count }) => (
                    <button key={tag} type="button" onClick={() => props.onTagChange(props.activeTag === tag ? null : tag)} className={cn("home-meta rounded-md bg-muted px-2 py-1 transition hover:bg-muted/70", props.activeTag === tag && "bg-blue-600 text-white hover:bg-blue-600")}>#{tag}<span className="ml-1 opacity-60">{count}</span></button>
                  ))}
                </div>
              </div>
            </section>
            <section>
              <h3 className="home-supporting mb-2 flex items-center gap-2 font-semibold"><CalendarDays className="size-3.5 text-muted-foreground" />时间范围</h3>
              <div className="flex flex-wrap gap-1.5">
                {props.years.map((year) => <button key={year} type="button" onClick={() => props.onYearChange(props.activeYear === year ? null : year)} className={cn("home-meta rounded-md bg-muted px-2.5 py-1", props.activeYear === year && "bg-foreground text-background")}>{year}</button>)}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {availableMonths.map((month) => {
                  return <button key={month} type="button" onClick={() => props.onMonthChange(props.activeMonth === month ? null : month)} className={cn("home-meta rounded-md bg-muted px-2 py-1", props.activeMonth === month && "bg-foreground text-background")}>{month}月</button>;
                })}
              </div>
            </section>
            {filterActive && <Button variant="secondary" size="sm" className="w-full" onClick={props.onReset}><RotateCcw />重置筛选</Button>}
          </PopoverContent>
        </Popover>
      </div>
    </Card>
  );
}
