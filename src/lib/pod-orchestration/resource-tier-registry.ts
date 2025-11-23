/**
 * Supported currencies
 */
export type Currency = "usd" | "eur" | "brl";

/**
 * Resource tier definition
 * Defines compute, memory, and storage resources for pods
 */
export type ResourceTier = {
  id: string;
  name: string;
  cpu: number;
  memory: number;
  storage: number;
};

/**
 * Central registry of all resource tiers
 * Used by both frontend (pricing) and backend (pod provisioning)
 */
export const RESOURCE_TIERS = {
  "dev.small": {
    id: "dev.small",
    name: "dev.small",
    cpu: 1,
    memory: 2,
    storage: 20,
  },
  "dev.medium": {
    id: "dev.medium",
    name: "dev.medium",
    cpu: 2,
    memory: 4,
    storage: 40,
  },
  "dev.large": {
    id: "dev.large",
    name: "dev.large",
    cpu: 4,
    memory: 8,
    storage: 80,
  },
  "dev.xlarge": {
    id: "dev.xlarge",
    name: "dev.xlarge",
    cpu: 8,
    memory: 16,
    storage: 160,
  },
} satisfies Record<string, ResourceTier>;

/**
 * Type-safe tier ID
 */
export type TierId = keyof typeof RESOURCE_TIERS;

/**
 * Get resource tier by ID (type-safe)
 */
export const getResourceTier = (tierId: TierId): ResourceTier => {
  return RESOURCE_TIERS[tierId];
};

/**
 * Get resource tier by ID (unsafe, for external input)
 */
export const getResourceTierUnsafe = (tierId: string): ResourceTier | undefined => {
  return RESOURCE_TIERS[tierId as TierId];
};

/**
 * Get all resource tiers
 */
export const getAllResourceTiers = (): ResourceTier[] => {
  return Object.values(RESOURCE_TIERS);
};

/**
 * Get resource tier by name
 */
export const getResourceTierByName = (name: string): ResourceTier | undefined => {
  return getAllResourceTiers().find((tier) => tier.name === name);
};

/**
 * Pricing table with all currencies
 * Single source of truth for all pricing across the application
 * Used by: frontend (pricing pages), backend (billing), scripts (Stripe setup)
 */
export const PRICING_TABLE: Record<TierId, Record<Currency, number>> = {
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
 * Snapshot storage pricing per GB per month
 * Industry standard: ~$0.10/GB/month
 * Single source of truth for snapshot storage pricing
 */
export const SNAPSHOT_STORAGE_PRICING: Record<Currency, number> = {
  usd: 0.1, // $0.10/GB/month
  eur: 0.09, // €0.09/GB/month
  brl: 0.5, // R$0.50/GB/month
};

