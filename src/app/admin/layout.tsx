import type { Metadata } from "next";
import AdminShell from "./_components/AdminShell";

export const metadata: Metadata = {
  title: "管理后台 | GeekShare",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
