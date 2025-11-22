"use client";

import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { getUTMFromSearchParams } from "../../lib/analytics/utm";
import { api } from "../../lib/trpc/client";

/**
 * Component that saves UTM parameters from URL to the database after OAuth callback
 * This handles GitHub OAuth users who have UTM params in their callback URL
 */
export const UTMPersister = () => {
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const hasAttemptedSave = useRef(false);

  const saveUtmMutation = api.users.saveUTMParameters.useMutation();

  useEffect(() => {
    // Only run once and only for authenticated users
    if (
      status !== "authenticated" ||
      !session?.user ||
      hasAttemptedSave.current
    ) {
      return;
    }

    // Check if there are UTM parameters in the URL
    const utm = getUTMFromSearchParams(searchParams);

    if (utm) {
      hasAttemptedSave.current = true;

      // Save to database
      saveUtmMutation.mutate(utm, {
        onSuccess: () => {
          console.log("[UTM] Successfully saved UTM parameters to database");
        },
        onError: (error) => {
          console.error("[UTM] Failed to save UTM parameters:", error.message);
        },
      });
    }
  }, [session, status, searchParams, saveUtmMutation]);

  return null; // This component doesn't render anything
};

