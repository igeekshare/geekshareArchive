"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const forcedTheme = pathname.startsWith("/admin") ? "light" : undefined;

  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem forcedTheme={forcedTheme} disableTransitionOnChange>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </NextThemesProvider>
  );
}
