import { type Currency, getCurrencyFromCountry } from "../../currency-utils";
import { createTRPCRouter, publicProcedure } from "../server";

export const currencyRouter = createTRPCRouter({
  /**
   * Detect user's currency from IP address
   */
  detectCurrency: publicProcedure.query(async ({ ctx }) => {
    try {
      // Get client IP from various headers (Vercel, Cloudflare, etc.)
      const forwarded = ctx.req?.headers.get("x-forwarded-for");
      const realIp = ctx.req?.headers.get("x-real-ip");
      const cfConnectingIp = ctx.req?.headers.get("cf-connecting-ip");

      // Try different headers in order of preference
      const ip =
        cfConnectingIp || realIp || forwarded?.split(",")[0] || "127.0.0.1";

      console.log('ip', ip);

      // For local development, default to USD
      if (
        ip === "127.0.0.1" ||
        ip === "::1" ||
        ip.startsWith("192.168.") ||
        ip.startsWith("10.") ||
        ip.endsWith("127.0.0.1")
      ) {
        return {
          currency: "usd" as Currency,
          country: null,
          countryName: null,
          ip: "local",
        };
      }

      // Dynamically import geoip-country to avoid webpack bundling issues
      const geoip = await import("geoip-country").then(m => m.default);

      // Look up country from IP using geoip-country
      const geo = geoip.lookup(ip);

      if (!geo || !geo.country) {
        // Default to USD if we can't determine location
        return {
          currency: "usd" as Currency,
          country: null,
          countryName: null,
          ip,
        };
      }

      // Get currency from country code
      const currency = getCurrencyFromCountry(geo.country);

      return {
        currency,
        country: geo.country,
        countryName: geo.name,
        ip,
      };
    } catch (error) {
      console.error("[Currency Detection] Error:", error);

      // Default to USD on error
      return {
        currency: "usd" as Currency,
        country: null,
        countryName: null,
        error: "Failed to detect location",
      };
    }
  }),
});
