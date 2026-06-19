import FloatingTabBar from "@/components/FloatingTabBar";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="min-h-screen max-w-4xl mx-auto px-4 py-8">
        {children}
      </main>
      <FloatingTabBar />
    </>
  );
}
