// Google Analytics tracking utilities
import { getUTMFromStorage } from "./utm";

type GTagEvent = {
  action: string;
  category?: string;
  label?: string;
  value?: number;
};

// Helper to safely call gtag
const gtag = (...args: any[]) => {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag(...args);
  }
};

// Track generic events
export const trackEvent = ({ action, category, label, value }: GTagEvent) => {
  gtag("event", action, {
    event_category: category,
    event_label: label,
    value: value,
  });
};

// E-commerce tracking for GA4
export const trackBeginCheckout = (params: {
  currency: string;
  value: number;
  items: Array<{
    item_id: string;
    item_name: string;
    item_category?: string;
    price: number;
    quantity: number;
  }>;
}) => {
  // Include UTM parameters if available
  const utm = getUTMFromStorage();

  gtag("event", "begin_checkout", {
    currency: params.currency,
    value: params.value,
    items: params.items,
    // Add UTM parameters to the event
    ...(utm?.utmSource && { campaign_source: utm.utmSource }),
    ...(utm?.utmMedium && { campaign_medium: utm.utmMedium }),
    ...(utm?.utmCampaign && { campaign_name: utm.utmCampaign }),
    ...(utm?.utmTerm && { campaign_term: utm.utmTerm }),
    ...(utm?.utmContent && { campaign_content: utm.utmContent }),
  });
};

export const trackPurchase = (params: {
  transaction_id: string;
  currency: string;
  value: number;
  items: Array<{
    item_id: string;
    item_name: string;
    item_category?: string;
    price: number;
    quantity: number;
  }>;
}) => {
  // Include UTM parameters if available
  const utm = getUTMFromStorage();

  gtag("event", "purchase", {
    transaction_id: params.transaction_id,
    currency: params.currency,
    value: params.value,
    items: params.items,
    // Add UTM parameters to the event
    ...(utm?.utmSource && { campaign_source: utm.utmSource }),
    ...(utm?.utmMedium && { campaign_medium: utm.utmMedium }),
    ...(utm?.utmCampaign && { campaign_name: utm.utmCampaign }),
    ...(utm?.utmTerm && { campaign_term: utm.utmTerm }),
    ...(utm?.utmContent && { campaign_content: utm.utmContent }),
  });
};

// Add gtag types to window
declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

