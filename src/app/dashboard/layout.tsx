"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { UTMPersister } from "../../components/analytics/utm-persister";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "loading") return; // Still loading
    if (!session) router.push("/auth/signin");
  }, [session, status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin mx-auto mb-4 border-4 border-orange-500 border-t-transparent rounded-full" />
          <p className="font-mono font-bold text-white">LOADING...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  // Main dashboard page gets full-screen workbench (no padding, dark background)
  const isMainDashboard = pathname === "/dashboard";

  if (isMainDashboard) {
    return (
      <div className="bg-slate-900 min-h-screen">
        <UTMPersister />
        {children}
      </div>
    );
  }

  // Other pages (team, account) get clean layout with no sidebar
  return (
    <>
      <UTMPersister />
      {children}
    </>
  );
}