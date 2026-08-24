import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { DEFAULT_PUBLIC_SITE_CONFIG } from "@/lib/site-config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(DEFAULT_PUBLIC_SITE_CONFIG.seo.canonicalUrl),
  title: DEFAULT_PUBLIC_SITE_CONFIG.seo.title,
  description: DEFAULT_PUBLIC_SITE_CONFIG.seo.description,
  alternates: { canonical: DEFAULT_PUBLIC_SITE_CONFIG.seo.canonicalUrl },
  openGraph: {
    title: DEFAULT_PUBLIC_SITE_CONFIG.seo.title,
    description: DEFAULT_PUBLIC_SITE_CONFIG.seo.description,
    url: DEFAULT_PUBLIC_SITE_CONFIG.seo.canonicalUrl,
    siteName: DEFAULT_PUBLIC_SITE_CONFIG.branding.siteName,
    type: "website",
    locale: "zh_CN",
    images: ["/og-image.svg"],
  },

  twitter: {
    card: "summary_large_image",

    title: DEFAULT_PUBLIC_SITE_CONFIG.seo.title,
    description: DEFAULT_PUBLIC_SITE_CONFIG.seo.description,
    images: ["/og-image.svg"],
  },

  robots: {
    index: true,
    follow: true,
  },

  keywords: DEFAULT_PUBLIC_SITE_CONFIG.seo.keywords,
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className="min-h-screen bg-background text-foreground antialiased"
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
