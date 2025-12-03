// Reddit Pixel tracking utilities

// Helper to safely call rdt (Reddit pixel)
const rdt = (...args: unknown[]) => {
  if (typeof window !== "undefined" && window.rdt) {
    window.rdt(...args);
  }
};

// Track purchase/conversion event
export const trackRedditPurchase = (params: {
  transactionId: string;
  currency: string;
  value: number;
  itemCount?: number;
}) => {
  rdt("track", "Purchase", {
    transactionId: params.transactionId,
    currency: params.currency,
    value: params.value,
    itemCount: params.itemCount ?? 1,
  });
};

// Track sign up event
export const trackRedditSignUp = () => {
  rdt("track", "SignUp");
};

// Track lead event (e.g., starting checkout)
export const trackRedditLead = () => {
  rdt("track", "Lead");
};

// Track custom event
export const trackRedditCustomEvent = (
  eventName: string,
  eventData?: Record<string, unknown>
) => {
  rdt("track", eventName, eventData);
};

// Add rdt types to window
declare global {
  interface Window {
    rdt: (...args: unknown[]) => void;
  }
}

