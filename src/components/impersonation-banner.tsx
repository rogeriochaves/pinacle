"use client";

import { AlertTriangle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";

export function ImpersonationBanner() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [isExiting, setIsExiting] = useState(false);

  if (!session?.user?.isImpersonating) {
    return null;
  }

  const handleExitImpersonation = async () => {
    setIsExiting(true);
    try {
      // Update session to end impersonation
      await update({
        impersonating: false,
      });

      // Redirect to admin billing
      router.push("/admin/billing");
      router.refresh();
    } catch (error) {
      console.error("Failed to exit impersonation:", error);
      // Force logout as fallback
      await signOut({ callbackUrl: "/auth/signin" });
    }
  };

  return (
    <div className="sticky top-0 z-50 bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 animate-pulse" />
            <div>
              <p className="font-mono font-bold text-sm">
                🔐 IMPERSONATION MODE ACTIVE
              </p>
              <p className="font-mono text-xs opacity-90">
                Viewing as:{" "}
                <span className="font-bold">{session.user.email}</span> (
                {session.user.name || "No name"})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleExitImpersonation}
            disabled={isExiting}
            className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 rounded-lg font-mono font-bold text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {isExiting ? (
              "Exiting..."
            ) : (
              <>
                <X className="w-4 h-4" />
                Exit Impersonation
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
