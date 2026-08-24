import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "管理后台 | GeekShare",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
