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
export const RESOURCE_TIERS: Record<string, ResourceTier> = {
  "dev.small": {
    id: "dev.small",
    name: "dev.small",
    cpu: 0.5,
    memory: 1,
    storage: 10,
    price: 6,
  },
  "dev.medium": {
    id: "dev.medium",
    name: "dev.medium",
    cpu: 1,
    memory: 2,
    storage: 20,
    price: 12,
  },
  "dev.large": {
    id: "dev.large",
    name: "dev.large",
    cpu: 2,
    memory: 4,
    storage: 40,
    price: 24,
  },
  "dev.xlarge": {
    id: "dev.xlarge",
    name: "dev.xlarge",
    cpu: 4,
    memory: 8,
    storage: 80,
    price: 48,
  },
};

/**
 * Get resource tier by ID
 */
export const getResourceTier = (tierId: string): ResourceTier | undefined => {
  return RESOURCE_TIERS[tierId];
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

