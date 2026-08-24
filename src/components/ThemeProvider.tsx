"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

function InterfaceProviders({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  return (
    <TooltipProvider delayDuration={200}>
      {children}
      <Toaster
        theme={resolvedTheme === "dark" ? "dark" : resolvedTheme === "light" ? "light" : "system"}
        position="top-right"
        visibleToasts={3}
        duration={3000}
        closeButton
        richColors={false}
        offset={{ top: "76px", right: "16px" }}
        mobileOffset={{ top: "124px", right: "12px", left: "12px" }}
        containerAriaLabel="操作通知"
        toastOptions={{
          closeButtonAriaLabel: "关闭通知",
          classNames: {
            toast: "!rounded-lg !border-border !bg-popover !text-popover-foreground !shadow-lg",
            description: "!text-muted-foreground",
          },
        }}
      />
    </TooltipProvider>
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const forcedTheme = pathname.startsWith("/admin") ? "light" : undefined;

  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem forcedTheme={forcedTheme} disableTransitionOnChange>
      <InterfaceProviders>{children}</InterfaceProviders>
    </NextThemesProvider>
  );
}
