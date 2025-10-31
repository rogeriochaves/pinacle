import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { stripePrices } from "../db/schema";
import type { TierId } from "../pod-orchestration/resource-tier-registry";

export type Currency = "usd" | "eur" | "brl";

/**
 * Get Stripe price ID for a specific tier and currency
 */
export const getStripePriceId = async (
  tierId: TierId,
  currency: Currency = "usd",
): Promise<string | null> => {
  const result = await db
    .select()
    .from(stripePrices)
    .where(
      and(
        eq(stripePrices.tierId, tierId),
        eq(stripePrices.currency, currency),
        eq(stripePrices.active, true),
      ),
    )
    .limit(1);

  return result[0]?.stripePriceId || null;
};

/**
 * Get all prices for a specific tier
 */
export const getTierPrices = async (tierId: TierId) => {
  const result = await db
    .select()
    .from(stripePrices)
    .where(and(eq(stripePrices.tierId, tierId), eq(stripePrices.active, true)));

  return result;
};

/**
 * Get Stripe product ID for a specific tier
 */
export const getStripeProductId = async (tierId: TierId): Promise<string | null> => {
  const result = await db
    .select()
    .from(stripePrices)
    .where(and(eq(stripePrices.tierId, tierId), eq(stripePrices.active, true)))
    .limit(1);

  return result[0]?.stripeProductId || null;
};

