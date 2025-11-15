// Google Analytics tracking utilities

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
  gtag("event", "begin_checkout", {
    currency: params.currency,
    value: params.value,
    items: params.items,
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
  gtag("event", "purchase", {
    transaction_id: params.transaction_id,
    currency: params.currency,
    value: params.value,
    items: params.items,
  });
};

// Add gtag types to window
declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

