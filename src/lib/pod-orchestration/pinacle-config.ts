/**
 * pinacle.yaml Configuration Schema
 *
 * This file defines the schema for the pinacle.yaml configuration file.
 * This file is committed to user repositories and serves as the source of truth
 * for pod configuration preferences.
 *
 * Key principles:
 * - Simple and user-editable
 * - No sensitive data (environment variables stored separately)
 * - No complex service configurations (use service registry)
 * - Matches the setup form exactly for round-tripping
 */

import yaml from "js-yaml";
import { z } from "zod";
import { RESOURCE_TIERS, type TierId } from "./resource-tier-registry";
import { SERVICE_TEMPLATES } from "./service-registry";

/**
 * Derive valid tier IDs from the resource tier registry
 */
const TIER_IDS = Object.keys(RESOURCE_TIERS) as [TierId, ...TierId[]];

/**
 * Derive valid service names from the service registry
 */
const SERVICE_NAMES = Object.keys(SERVICE_TEMPLATES);

/**
 * Tab configuration for pod UI
 */
const TabSchema = z.object({
  name: z.string(),
  url: z.string(),
});

/**
 * pinacle.yaml schema
 *
 * Minimal configuration that users commit to their repositories.
 * Complex details are resolved from registries at provision time.
 */
export const PinacleConfigSchema = z.object({
  // Schema version for future compatibility
  // Accept both string and number (YAML parsers may interpret 1.0 as number)
  version: z
    .union([z.literal("1.0"), z.literal(1.0)])
    .transform(() => "1.0" as const)
    .default("1.0"),

  // Pod/project name (optional, defaults to repo name)
  name: z.string().optional(),

  // Resource tier - determines CPU, memory, storage
  // Valid values are derived from RESOURCE_TIERS registry
  tier: z.enum(TIER_IDS).default("dev.small"),

  // Services to run in the pod
  // Valid service names are derived from SERVICE_TEMPLATES registry
  services: z
    .array(z.enum(SERVICE_NAMES as [string, ...string[]]))
    .default(["claude-code", "vibe-kanban", "code-server"]),

  // Optional template ID (for reference/UI purposes)
  // If not specified, services list is used directly
  template: z.string().optional(),

  // Tabs for the pod UI (auto-generated from services by default)
  tabs: z.array(TabSchema).optional(),
});

export type PinacleConfig = z.infer<typeof PinacleConfigSchema>;

/**
 * Default pinacle.yaml configuration
 */
export const DEFAULT_PINACLE_CONFIG: PinacleConfig = {
  version: "1.0",
  tier: "dev.small",
  services: ["claude-code", "vibe-kanban", "code-server"],
};

/**
 * Convert pinacle.yaml config to YAML string
 */
export const serializePinacleConfig = (config: PinacleConfig): string => {
  const header = [
    "# Pinacle Pod Configuration",
    "# https://pinacle.dev/docs/pinacle-yaml",
    "",
    `# Available tiers: ${Object.keys(RESOURCE_TIERS).join(", ")}`,
    `# Available services: ${Object.keys(SERVICE_TEMPLATES).join(", ")}`,
    "",
  ].join("\n");

  // Serialize using js-yaml for proper YAML formatting
  const yamlContent = yaml.dump(config, {
    indent: 2,
    lineWidth: 80,
    noRefs: true,
    sortKeys: false,
    quotingType: '"', // Use double quotes for strings
    forceQuotes: false, // Only quote when necessary
  });

  return header + yamlContent;
};

/**
 * Parse YAML string to pinacle.yaml config
 */
export const parsePinacleConfig = (yamlContent: string): PinacleConfig => {
  try {
    // Parse YAML using js-yaml
    const parsed = yaml.load(yamlContent);

    // Validate and transform using Zod schema
    return PinacleConfigSchema.parse(parsed);
  } catch (error) {
    console.error("Failed to parse pinacle.yaml:", error);
    throw new Error(
      `Invalid pinacle.yaml format: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Generate pinacle.yaml from form submission
 */
export const generatePinacleConfigFromForm = (formData: {
  template?: string;
  tier?: string;
  customServices?: string[];
  podName?: string;
  tabs?: Array<{ name: string; url: string }>;
}): PinacleConfig => {
  return PinacleConfigSchema.parse({
    version: "1.0",
    name: formData.podName,
    template: formData.template,
    tier: formData.tier || "dev.small",
    services:
      formData.customServices && formData.customServices.length > 0
        ? formData.customServices
        : DEFAULT_PINACLE_CONFIG.services,
    tabs: formData.tabs,
  });
};

/**
 * Generate default tabs from services
 * Auto-creates tabs for each service that has a UI port
 */
export const generateDefaultTabs = (
  services: string[],
  _podSlug: string,
): Array<{ name: string; url: string }> => {
  const tabs: Array<{ name: string; url: string }> = [];

  // Add app tab (user's application)
  tabs.push({
    name: "App",
    url: "http://localhost:3000",
  });

  // Add tabs for each service
  for (const serviceName of services) {
    const service = SERVICE_TEMPLATES[serviceName as keyof typeof SERVICE_TEMPLATES];
    if (service?.defaultPort) {
      tabs.push({
        name: service.displayName,
        url: `http://localhost:${service.defaultPort}`,
      });
    }
  }

  return tabs;
};

/**
 * Convert database pod record to PinacleConfig
 * Parses the config JSON and validates it
 */
export const podRecordToPinacleConfig = (podRecord: {
  config: string;
  name: string;
}): PinacleConfig => {
  try {
    const parsed = JSON.parse(podRecord.config);
    return PinacleConfigSchema.parse(parsed);
  } catch (error) {
    console.error("Failed to parse pod config:", error);
    throw new Error(
      `Invalid pod config in database for pod ${podRecord.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Convert PinacleConfig to JSON string for database storage
 */
export const pinacleConfigToJSON = (config: PinacleConfig): string => {
  return JSON.stringify(config, null, 2);
};

/**
 * Get tier from pod config
 */
export const getTierFromConfig = (config: PinacleConfig): TierId => {
  return config.tier;
};

/**
 * Get resource specifications from tier
 */
export const getResourcesFromTier = (
  tierId: TierId,
): { cpuCores: number; memoryMb: number; storageMb: number } => {
  const tier = RESOURCE_TIERS[tierId];
  return {
    cpuCores: tier.cpu,
    memoryMb: tier.memory * 1024, // Convert GB to MB
    storageMb: tier.storage * 1024, // Convert GB to MB
  };
};

/**
 * Get services from pod config
 */
export const getServicesFromConfig = (config: PinacleConfig): string[] => {
  return config.services;
};

/**
 * Get tabs from pod config (with auto-generation if not specified)
 */
export const getTabsFromConfig = (
  config: PinacleConfig,
  podSlug: string,
): Array<{ name: string; url: string }> => {
  if (config.tabs && config.tabs.length > 0) {
    return config.tabs;
  }
  return generateDefaultTabs(config.services, podSlug);
};

/**
 * Convert PodSpec (runtime config) to PinacleConfig (YAML config)
 * Extracts only the user-facing configuration that should be stored in pinacle.yaml
 */
export const podConfigToPinacleConfig = (
  podConfig: import("./types").PodSpec,
): PinacleConfig => {
  // Find matching tier from resources
  let tier: TierId = "dev.small"; // Default fallback
  for (const [tierId, tierSpec] of Object.entries(RESOURCE_TIERS)) {
    if (
      tierSpec.cpu === podConfig.resources.cpuCores &&
      tierSpec.memory * 1024 === podConfig.resources.memoryMb &&
      tierSpec.storage * 1024 === podConfig.resources.storageMb
    ) {
      tier = tierId as TierId;
      break;
    }
  }

  // Extract service names from ServiceConfig array
  const services = podConfig.services.map((service) => service.name);

  // Build PinacleConfig
  const pinacleConfig: PinacleConfig = {
    version: "1.0",
    tier,
    services,
  };

  // Add optional fields if present
  if (podConfig.name) {
    pinacleConfig.name = podConfig.name;
  }

  if (podConfig.templateId) {
    pinacleConfig.template = podConfig.templateId;
  }

  // Note: tabs would need to be derived from services or provided separately
  // as PodSpec doesn't store the tabs configuration

  return pinacleConfig;
};
