#!/usr/bin/env tsx
/**
 * Stripe Product and Price Setup Script
 *
 * Creates Stripe products, billing meters, and prices for all resource tiers
 * Uses Stripe's new Billing Meters API for usage-based pricing
 * Supports multiple currencies (USD, EUR, BRL) with marketable pricing
 * Saves price IDs to database for fast lookup
 *
 * To update pricing, edit the PRICING_TABLE constant below
 */

import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { stripePrices } from "../src/lib/db/schema";
import {
  getAllResourceTiers,
  RESOURCE_TIERS,
  type TierId,
} from "../src/lib/pod-orchestration/resource-tier-registry";
import { stripe } from "../src/lib/stripe";
import { generateKSUID } from "../src/lib/utils";

// Currency configuration
type Currency = "usd" | "eur" | "brl";

const CURRENCIES: Currency[] = ["usd", "eur", "brl"];

/**
 * Pricing table with clean, marketable prices per tier and currency
 * Update this table directly to change pricing
 * Prices are monthly, will be converted to hourly automatically
 */
const PRICING_TABLE: Record<TierId, Record<Currency, number>> = {
  "dev.small": {
    usd: 7,
    eur: 6,
    brl: 30,
  },
  "dev.medium": {
    usd: 14,
    eur: 12,
    brl: 60,
  },
  "dev.large": {
    usd: 28,
    eur: 24,
    brl: 120,
  },
  "dev.xlarge": {
    usd: 56,
    eur: 48,
    brl: 240,
  },
};

/**
 * Calculate hourly price from monthly price
 * Assumes 730 hours per month (365 days * 24 hours / 12 months)
 */
const monthlyToHourly = (monthlyPrice: number): number => {
  return monthlyPrice / 730;
};

/**
 * Create or update billing meter for a resource tier
 */
const createOrUpdateMeter = async (tierId: TierId) => {
  const tier = RESOURCE_TIERS[tierId];
  const eventName = `pod_runtime_${tierId.replace(".", "_")}`;

  try {
    // Check if meter already exists
    const existingMeters = await stripe.billing.meters.list({
      limit: 100,
    });

    let meter = existingMeters.data.find(
      (m) => m.event_name === eventName,
    );

    if (meter) {
      console.log(`  Meter already exists for ${tierId}: ${meter.id}`);
      // Update meter if needed
      meter = await stripe.billing.meters.update(meter.id, {
        display_name: `Pod Runtime - ${tier.name}`,
      });
    } else {
      // Create new meter
      meter = await stripe.billing.meters.create({
        display_name: `Pod Runtime - ${tier.name}`,
        event_name: eventName,
        default_aggregation: {
          formula: "sum",
        },
        value_settings: {
          event_payload_key: "hours",
        },
      });
      console.log(`  ✓ Created meter for ${tierId}: ${meter.id}`);
    }

    return meter;
  } catch (error) {
    console.error(`  ✗ Failed to create meter for ${tierId}:`, error);
    throw error;
  }
};

/**
 * Create or update Stripe product for a resource tier
 */
const createOrUpdateProduct = async (tierId: TierId) => {
  const tier = RESOURCE_TIERS[tierId];

  try {
    // Check if product already exists
    const existingProducts = await stripe.products.list({
      limit: 100,
    });

    let product = existingProducts.data.find(
      (p) => p.metadata?.tierId === tierId,
    );

    if (product) {
      console.log(`  Product already exists for ${tierId}: ${product.id}`);
      // Update product if needed
      product = await stripe.products.update(product.id, {
        name: `Pod Runtime - ${tier.name}`,
        description: `${tier.cpu} vCPU, ${tier.memory}GB RAM, ${tier.storage}GB storage`,
        metadata: {
          tierId: tier.id,
          cpu: tier.cpu.toString(),
          memory: tier.memory.toString(),
          storage: tier.storage.toString(),
        },
      });
    } else {
      // Create new product
      product = await stripe.products.create({
        name: `Pod Runtime - ${tier.name}`,
        description: `${tier.cpu} vCPU, ${tier.memory}GB RAM, ${tier.storage}GB storage`,
        unit_label: "hour",
        metadata: {
          tierId: tier.id,
          cpu: tier.cpu.toString(),
          memory: tier.memory.toString(),
          storage: tier.storage.toString(),
        },
      });
      console.log(`  ✓ Created product for ${tierId}: ${product.id}`);
    }

    return product;
  } catch (error) {
    console.error(`  ✗ Failed to create product for ${tierId}:`, error);
    throw error;
  }
};

/**
 * Create or update metered price for a product in a specific currency
 * Now uses billing meters instead of legacy usage records
 */
const createOrUpdatePrice = async (
  productId: string,
  meterId: string,
  tierId: TierId,
  currency: Currency,
) => {
  const tier = RESOURCE_TIERS[tierId];

  // Get the monthly price from pricing table
  const monthlyPrice = PRICING_TABLE[tierId][currency];

  // Calculate hourly price
  const hourlyPrice = monthlyToHourly(monthlyPrice);

  // Convert to cents/minor units
  const unitAmountDecimal = (hourlyPrice * 100).toFixed(4);

  try {
    // Check if price already exists
    const existingPrices = await stripe.prices.list({
      product: productId,
      currency: currency,
      limit: 100,
    });

    let price = existingPrices.data.find(
      (p) => p.metadata?.tierId === tierId && p.metadata?.currency === currency,
    );

    if (price?.active) {
      console.log(
        `    Price already exists for ${tierId} (${currency}): ${price.id}`,
      );
      return price;
    }

    // Create new price with billing meter
    price = await stripe.prices.create({
      product: productId,
      currency: currency,
      unit_amount_decimal: unitAmountDecimal,
      recurring: {
        interval: "month",
        usage_type: "metered",
        meter: meterId, // NEW: Use meter instead of aggregate_usage
      },
      billing_scheme: "per_unit",
      metadata: {
        tierId: tier.id,
        currency: currency,
        meterId: meterId,
      },
    });

    console.log(`    ✓ Created price for ${tierId} (${currency}): ${price.id}`);
    return price;
  } catch (error) {
    console.error(
      `    ✗ Failed to create price for ${tierId} (${currency}):`,
      error,
    );
    throw error;
  }
};

/**
 * Save price to database
 */
const savePriceToDb = async (
  tierId: TierId,
  currency: Currency,
  stripePriceId: string,
  stripeProductId: string,
  unitAmountDecimal: string,
) => {
  try {
    // Check if price already exists in DB
    const existingPrice = await db
      .select()
      .from(stripePrices)
      .where(eq(stripePrices.stripePriceId, stripePriceId))
      .limit(1);

    if (existingPrice.length > 0) {
      // Update existing price
      await db
        .update(stripePrices)
        .set({
          active: true,
          unitAmountDecimal,
          updatedAt: new Date(),
        })
        .where(eq(stripePrices.stripePriceId, stripePriceId));

      console.log(`      ✓ Updated price in DB: ${stripePriceId}`);
    } else {
      // Insert new price
      await db.insert(stripePrices).values({
        id: generateKSUID("stripe_price"),
        tierId: tierId,
        currency: currency,
        stripePriceId: stripePriceId,
        stripeProductId: stripeProductId,
        unitAmountDecimal,
        interval: "month",
        usageType: "metered",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`      ✓ Saved price to DB: ${stripePriceId}`);
    }
  } catch (error) {
    console.error(`      ✗ Failed to save price to DB:`, error);
    throw error;
  }
};

/**
 * Main setup function
 */
const setupStripeProducts = async () => {
  console.log("🚀 Setting up Stripe products and prices\n");

  const tiers = getAllResourceTiers();

  for (const tier of tiers) {
    console.log(`📦 Processing tier: ${tier.id}`);

    try {
      // Create or update billing meter
      const meter = await createOrUpdateMeter(tier.id as TierId);

      // Create or update product
      const product = await createOrUpdateProduct(tier.id as TierId);

      // Create prices for all currencies
      for (const currency of CURRENCIES) {
        console.log(`  💰 Creating price for ${currency.toUpperCase()}`);

        const price = await createOrUpdatePrice(
          product.id,
          meter.id,
          tier.id as TierId,
          currency,
        );

        // Save to database
        await savePriceToDb(
          tier.id as TierId,
          currency,
          price.id,
          product.id,
          price.unit_amount_decimal || "0",
        );
      }

      console.log(`  ✅ Completed tier: ${tier.id}\n`);
    } catch (error) {
      console.error(`  ❌ Failed to process tier: ${tier.id}\n`);
      throw error;
    }
  }

  console.log("✅ All products and prices set up successfully!");
};

// Run the setup
setupStripeProducts()
  .then(() => {
    console.log("\n🎉 Setup complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  });
