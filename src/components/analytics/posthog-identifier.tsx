"use client";

import { useSession } from "next-auth/react";
import posthog from "posthog-js";
import { useEffect } from "react";
import { getUTMFromStorage } from "../../lib/analytics/utm";

/**
 * Component that identifies users in PostHog when they log in
 * This connects your NextAuth session to PostHog user profiles
 */
export const PostHogIdentifier = () => {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;

    if (session?.user) {
      // Get UTM parameters to include in user properties
      const utm = getUTMFromStorage();

      // User is logged in - identify them in PostHog
      posthog.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
        // Add any other user properties you want to track
        githubId: session.user.githubId,
        isImpersonating: session.user.isImpersonating || false,
        // Include UTM parameters if available
        ...(utm?.utmSource && { utm_source: utm.utmSource }),
        ...(utm?.utmMedium && { utm_medium: utm.utmMedium }),
        ...(utm?.utmCampaign && { utm_campaign: utm.utmCampaign }),
        ...(utm?.utmTerm && { utm_term: utm.utmTerm }),
        ...(utm?.utmContent && { utm_content: utm.utmContent }),
      });
    } else {
      // User is logged out - reset PostHog
      posthog.reset();
    }
  }, [session, status]);

  return null; // This component doesn't render anything
};
