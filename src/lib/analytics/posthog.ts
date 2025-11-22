// PostHog tracking utilities
import posthog from "posthog-js";
import { getUTMFromStorage } from "./utm";

type EventProperties = Record<string, string | number | boolean | null>;

// Helper to safely call posthog
const captureEvent = (eventName: string, properties?: EventProperties) => {
  if (typeof window !== "undefined" && posthog) {
    posthog.capture(eventName, properties);
  }
};

// Manual exception capture
export const captureException = (
  error: Error,
  additionalProperties?: EventProperties,
) => {
  if (typeof window !== "undefined" && posthog) {
    posthog.captureException(error, additionalProperties);
  }
};

// User identification (usually handled by PostHogIdentifier component)
export const identifyUser = (
  userId: string,
  properties?: EventProperties,
) => {
  if (typeof window !== "undefined" && posthog) {
    posthog.identify(userId, properties);
  }
};

// Reset user (on logout)
export const resetUser = () => {
  if (typeof window !== "undefined" && posthog) {
    posthog.reset();
  }
};

// Group identification (e.g., for teams/organizations)
export const identifyGroup = (
  groupType: string,
  groupKey: string,
  properties?: EventProperties,
) => {
  if (typeof window !== "undefined" && posthog) {
    posthog.group(groupType, groupKey, properties);
  }
};

// E-commerce tracking for PostHog
export const trackBeginCheckout = (params: {
  currency: string;
  value: number;
  tierId: string;
  tierName: string;
}) => {
  // Include UTM parameters if available
  const utm = getUTMFromStorage();

  captureEvent("begin_checkout", {
    currency: params.currency,
    value: params.value,
    tier_id: params.tierId,
    tier_name: params.tierName,
    category: "subscription",
    // Add UTM parameters to the event
    ...(utm?.utmSource && { utm_source: utm.utmSource }),
    ...(utm?.utmMedium && { utm_medium: utm.utmMedium }),
    ...(utm?.utmCampaign && { utm_campaign: utm.utmCampaign }),
    ...(utm?.utmTerm && { utm_term: utm.utmTerm }),
    ...(utm?.utmContent && { utm_content: utm.utmContent }),
  });
};

export const trackPurchase = (params: {
  transactionId: string;
  currency: string;
  value: number;
  tierId: string;
  tierName: string;
}) => {
  // Include UTM parameters if available
  const utm = getUTMFromStorage();

  captureEvent("purchase", {
    transaction_id: params.transactionId,
    currency: params.currency,
    value: params.value,
    tier_id: params.tierId,
    tier_name: params.tierName,
    category: "subscription",
    // Add UTM parameters to the event
    ...(utm?.utmSource && { utm_source: utm.utmSource }),
    ...(utm?.utmMedium && { utm_medium: utm.utmMedium }),
    ...(utm?.utmCampaign && { utm_campaign: utm.utmCampaign }),
    ...(utm?.utmTerm && { utm_term: utm.utmTerm }),
    ...(utm?.utmContent && { utm_content: utm.utmContent }),
  });
};

