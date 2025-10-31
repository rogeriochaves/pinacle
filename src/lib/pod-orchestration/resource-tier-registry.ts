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
  price: number;
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
    price: 7,
  },
  "dev.medium": {
    id: "dev.medium",
    name: "dev.medium",
    cpu: 2,
    memory: 4,
    storage: 40,
    price: 14,
  },
  "dev.large": {
    id: "dev.large",
    name: "dev.large",
    cpu: 4,
    memory: 8,
    storage: 80,
    price: 28,
  },
  "dev.xlarge": {
    id: "dev.xlarge",
    name: "dev.xlarge",
    cpu: 8,
    memory: 16,
    storage: 160,
    price: 56,
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

