"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "../../components/dashboard/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return; // Still loading
    if (!session) router.push("/auth/signin");
  }, [session, status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="border-2 border-border-contrast bg-card p-8 text-card-foreground relative flex flex-col items-center rounded-sm after:absolute after:-bottom-2 after:-right-2 after:left-2 after:top-2 after:-z-10 after:content-[''] after:bg-dotted">
          <div className="animate-pulse h-8 w-8 bg-orange-200 border-2 border-border-contrast rounded-sm"></div>
          <p className="mt-4 font-mono font-bold text-foreground">LOADING...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="bg-background min-h-screen">
      <Sidebar />
      <main className="lg:pl-72">
        <div className="px-4 sm:px-6 lg:px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
