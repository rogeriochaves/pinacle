import posthog from "posthog-js";
import { useEffect, useState } from "react";

/**
 * Hook to get a PostHog feature flag value
 * Handles the async loading of feature flags and URL overrides
 *
 * @param flagKey - The feature flag key
 * @param defaultValue - Default value to use while loading or if flag is not found
 * @returns The feature flag value (string, boolean, or the default value)
 *
 * @example
 * const variant = useFeatureFlag("my-experiment", "control");
 * if (variant === "test") { ... }
 *
 * @example
 * const isEnabled = useFeatureFlag("new-feature", false);
 * if (isEnabled) { ... }
 */
export const useFeatureFlag = (
  flagKey: string,
  defaultValue = "control",
): string | boolean => {
  const [flagValue, setFlagValue] = useState<string | boolean>(defaultValue);

  useEffect(() => {
    const updateFlag = () => {
      const value = posthog.getFeatureFlag(flagKey);
      console.log('posthog.getFeatureFlag value', value);
      if (value !== undefined) {
        setFlagValue(value);
      }
    };

    // Check immediately in case flags are already loaded
    updateFlag();

    // Listen for when flags are loaded (handles initial load and URL overrides)
    posthog.onFeatureFlags(updateFlag);
  }, [flagKey]);

  return flagValue;
};

