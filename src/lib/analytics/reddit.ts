// Reddit Pixel tracking utilities (client-side)

// Helper to safely call rdt (Reddit pixel)
const rdt = (...args: unknown[]) => {
  if (typeof window !== "undefined" && window.rdt) {
    window.rdt(...args);
  }
};

// Track purchase/conversion event
// conversion_id must match the server-side Conversions API for deduplication
export const trackRedditPurchase = (params: {
  conversionId: string; // Required for deduplication with server-side
  currency: string;
  value: number;
  itemCount?: number;
}) => {
  rdt("track", "Purchase", {
    currency: params.currency,
    value: params.value,
    itemCount: params.itemCount ?? 1,
    conversionId: params.conversionId, // For deduplication with Conversions API
  });
};

// Track sign up event
export const trackRedditSignUp = (conversionId?: string) => {
  rdt("track", "SignUp", conversionId ? { conversionId } : undefined);
};

// Track lead event (e.g., starting checkout)
export const trackRedditLead = () => {
  rdt("track", "Lead");
};

// Track custom event
export const trackRedditCustomEvent = (
  eventName: string,
  eventData?: Record<string, unknown>,
) => {
  rdt("track", eventName, eventData);
};

// Add rdt types to window
declare global {
  interface Window {
    rdt: (...args: unknown[]) => void;
  }
}
