import { Suspense } from "react";
import ArchivePageClient from "./ArchivePageClient";

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ArchivePageClient />
    </Suspense>
  );
}
