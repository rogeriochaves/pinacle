import posthog from "posthog-js";

setTimeout(() => {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    defaults: "2025-05-24",
    capture_exceptions: true, // This enables capturing exceptions using Error Tracking, set to false if you don't want this
    debug: process.env.NODE_ENV === "development",
    person_profiles: "identified_only", // Only create profiles for logged-in users
    disable_surveys: true,
  });

  // Apply URL-based feature flag overrides
  // Usage: Add ?ph_<flag-name>=<value> to URL to override any feature flag
  // Example: ?ph_hide-template-pricing=test
  // This is local-only and doesn't affect other users
  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    const overrides: Record<string, string | boolean> = {};

    for (const [key, value] of urlParams.entries()) {
      if (key.startsWith("ph_")) {
        const flagName = key.slice(3); // Remove "ph_" prefix
        // Convert string values to booleans if applicable
        const flagValue =
          value === "true" ? true : value === "false" ? false : value;
        overrides[flagName] = flagValue;
      }
    }

    if (Object.keys(overrides).length > 0) {
      // Wait for PostHog to be ready, then apply overrides
      posthog.featureFlags.overrideFeatureFlags({ flags: overrides });
      console.log("[PostHog] Feature flag overrides applied:", overrides);
    }
  }
}, 0);
