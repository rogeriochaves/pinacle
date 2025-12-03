// Reddit Conversions API - Server-side tracking

const REDDIT_PIXEL_ID = "a2_i470svrjbwmv";
const REDDIT_CONVERSIONS_API_URL = `https://ads-api.reddit.com/api/v3/pixels/${REDDIT_PIXEL_ID}/conversion_events`;

type RedditConversionEvent = {
  event_at: number; // Unix epoch timestamp in milliseconds
  action_source: "web" | "app" | "offline";
  type: {
    tracking_type:
      | "PageVisit"
      | "ViewContent"
      | "Search"
      | "AddToCart"
      | "AddToWishlist"
      | "Purchase"
      | "Lead"
      | "SignUp"
      | "CUSTOM";
    custom_event_name?: string;
  };
  // Click ID from Reddit ad (rdt_cid URL param)
  click_id?: string;
  // User identifiers for matching
  user?: {
    email?: string;
    phone_number?: string;
    external_id?: string;
    ip_address?: string;
    user_agent?: string;
    uuid?: string;
    idfa?: string;
    aaid?: string;
    screen_dimensions?: {
      width: number;
      height: number;
    };
  };
  // Event metadata
  metadata?: {
    item_count?: number;
    currency?: string; // ISO 4217 3-letter code
    value?: number; // Decimal value
    conversion_id?: string; // Required for deduplication with pixel
    products?: Array<{
      id?: string; // SKU or GTIN
      name?: string;
      category?: string;
    }>;
  };
};

type RedditConversionsPayload = {
  data: {
    events: RedditConversionEvent[];
  };
};

/**
 * Send conversion event to Reddit Conversions API
 */
export const sendRedditConversion = async (
  event: RedditConversionEvent,
): Promise<boolean> => {
  const accessToken = process.env.REDDIT_CONVERSIONS_ACCESS_TOKEN;

  if (!accessToken) {
    console.log(
      "[Reddit] No REDDIT_CONVERSIONS_ACCESS_TOKEN configured, skipping conversion tracking",
    );
    return false;
  }

  const payload: RedditConversionsPayload = {
    data: {
      events: [event],
    },
  };

  try {
    const response = await fetch(REDDIT_CONVERSIONS_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[Reddit] Conversion API error:",
        response.status,
        errorText,
      );
      return false;
    }

    console.log(
      "[Reddit] Conversion event sent successfully:",
      event.type.tracking_type,
    );
    return true;
  } catch (error) {
    console.error("[Reddit] Failed to send conversion event:", error);
    return false;
  }
};

/**
 * Track a purchase conversion server-side
 */
export const trackRedditPurchaseServer = async (params: {
  transactionId: string;
  currency: string;
  value: number;
  email?: string;
  externalId?: string;
  ipAddress?: string;
  userAgent?: string;
  clickId?: string;
}): Promise<boolean> => {
  return sendRedditConversion({
    event_at: Date.now(),
    action_source: "web",
    type: {
      tracking_type: "Purchase",
    },
    ...(params.clickId && { click_id: params.clickId }),
    user: {
      ...(params.email && { email: params.email }),
      ...(params.externalId && { external_id: params.externalId }),
      ...(params.ipAddress && { ip_address: params.ipAddress }),
      ...(params.userAgent && { user_agent: params.userAgent }),
    },
    metadata: {
      currency: params.currency.toUpperCase(),
      value: params.value,
      item_count: 1,
      conversion_id: params.transactionId, // Required for deduplication with pixel
      products: [
        {
          id: "pinacle-subscription",
          name: "Pinacle Subscription",
          category: "subscription",
        },
      ],
    },
  });
};

/**
 * Track a signup conversion server-side
 */
export const trackRedditSignUpServer = async (params?: {
  email?: string;
  externalId?: string;
  ipAddress?: string;
  userAgent?: string;
  clickId?: string;
}): Promise<boolean> => {
  return sendRedditConversion({
    event_at: Date.now(),
    action_source: "web",
    type: {
      tracking_type: "SignUp",
    },
    ...(params?.clickId && { click_id: params.clickId }),
    user: params
      ? {
          ...(params.email && { email: params.email }),
          ...(params.externalId && { external_id: params.externalId }),
          ...(params.ipAddress && { ip_address: params.ipAddress }),
          ...(params.userAgent && { user_agent: params.userAgent }),
        }
      : undefined,
  });
};
