export const register = () => {
  // No-op for initialization
};

export const onRequestError = async (
  err: Error,
  request: {
    path: string;
    headers: { cookie?: string };
  },
  _context: {
    routerKind?: string;
    routeType?: string;
  },
) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getPostHogServer } = await import("./src/lib/posthog-server");
    const posthog = getPostHogServer();

    let distinctId: string | null = null;

    // Try to extract distinct_id from PostHog cookie
    if (request.headers.cookie) {
      const cookieString = request.headers.cookie;
      const postHogCookieMatch = cookieString.match(
        /ph_phc_.*?_posthog=([^;]+)/,
      );

      if (postHogCookieMatch?.[1]) {
        try {
          const decodedCookie = decodeURIComponent(postHogCookieMatch[1]);
          const postHogData = JSON.parse(decodedCookie);
          distinctId = postHogData.distinct_id;
        } catch (e) {
          console.error("Error parsing PostHog cookie:", e);
        }
      }
    }

    await posthog.captureException(err, distinctId || undefined);
  }
};

