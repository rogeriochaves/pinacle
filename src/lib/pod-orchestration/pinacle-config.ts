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
import {
  getServiceTemplate,
  SERVICE_TEMPLATES,
  type ServiceId,
} from "./service-registry";
import {
  getTemplateUnsafe,
  POD_TEMPLATES,
  type TemplateId,
} from "./template-registry";
import type { PodSpec } from "./types";

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
 * Process configuration for user applications
 */
const ProcessSchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  startCommand: z.union([z.string(), z.array(z.string())]),
  url: z.string().optional(),
  healthCheck: z.union([z.string(), z.array(z.string())]).optional(),
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

  // Resource tier - determines CPU, memory, storage
  // Valid values are derived from RESOURCE_TIERS registry
  tier: z.enum(TIER_IDS).default("dev.small"),

  // Services to run in the pod
  // Valid service names are derived from SERVICE_TEMPLATES registry
  services: z.array(z.enum(SERVICE_NAMES as [string, ...string[]])),

  // Optional template ID (for reference/UI purposes)
  // If not specified, services list is used directly
  template: z
    .enum(Object.keys(POD_TEMPLATES) as [TemplateId, ...TemplateId[]])
    .optional(),

  // Install command (runs once during provisioning)
  install: z.union([z.string(), z.array(z.string())]).optional(),

  // User processes (frontend, backend, workers, etc.)
  processes: z.array(ProcessSchema).optional().default([]),

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
  processes: [],
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
  template?: TemplateId;
  tier?: TierId;
  customServices?: ServiceId[];
  tabs?: Array<{ name: string; url: string }>;
  slug?: string;
  processConfig?: {
    installCommand?: string;
    startCommand?: string;
    appUrl?: string;
  };
}): PinacleConfig => {
  // Use customServices if provided, otherwise fall back to defaults
  const services =
    formData.customServices && formData.customServices.length > 0
      ? formData.customServices
      : DEFAULT_PINACLE_CONFIG.services;

  // Generate tabs if not provided
  const tabs =
    formData.tabs || generateDefaultTabs(services, formData.slug || "pod");

  // Build processes array from processConfig (for existing repos)
  const processes: Array<{
    name: string;
    displayName?: string;
    startCommand: string | string[];
    url?: string;
    healthCheck?: string | string[];
  }> = [];

  if (formData.processConfig?.startCommand) {
    processes.push({
      name: "app",
      displayName: "Application",
      startCommand: formData.processConfig.startCommand,
      url: formData.processConfig.appUrl,
    });
  }

  // If processes were added, add tabs for them
  const processTab = processes.find((p) => p.url);
  if (processTab?.url) {
    tabs.push({
      name: processTab.displayName || processTab.name,
      url: processTab.url,
    });
  }

  return PinacleConfigSchema.parse({
    version: "1.0",
    template: formData.template,
    tier: formData.tier || "dev.small",
    services,
    tabs,
    install: formData.processConfig?.installCommand,
    processes,
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
    const service =
      SERVICE_TEMPLATES[serviceName as keyof typeof SERVICE_TEMPLATES];
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
 * Expand PinacleConfig to full PodSpec
 * This is the SINGLE source of truth for PinacleConfig → PodSpec conversion
 *
 * @param pinacleConfig - The PinacleConfig from database (user's source of truth)
 * @param runtimeData - Runtime data (pod ID, name, environment, github info, etc.)
 * @returns Complete PodSpec ready for provisioning
 */
export const expandPinacleConfigToSpec = async (
  pinacleConfig: PinacleConfig,
  runtimeData: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    environment?: Record<string, string>;
    githubRepo?: string;
    githubBranch?: string;
    githubRepoSetup?: import("./types").PodSpec["githubRepoSetup"];
  },
): Promise<PodSpec> => {
  // Get template defaults if template is specified
  const template = pinacleConfig.template
    ? getTemplateUnsafe(pinacleConfig.template)
    : null;

  // Base image: use template's or default
  const baseImage = template?.baseImage || "alpine:3.22.1";

  // Resources: derive from tier in PinacleConfig
  const resources = getResourcesFromTier(pinacleConfig.tier);

  // Services: convert service names to ServiceConfig objects
  const services = pinacleConfig.services.map((serviceName) => {
    const serviceTemplate = getServiceTemplate(serviceName as ServiceId);

    return {
      name: serviceName,
      enabled: true,
      ports: [
        {
          name: serviceName,
          internal: serviceTemplate.defaultPort,
          protocol: "tcp" as const,
        },
      ],
      environment: serviceTemplate.environment || {},
      autoRestart: true,
      dependsOn: [],
    };
  });

  // Environment: merge template defaults + runtime data
  const environment: Record<string, string> = {
    ...(template?.environment || {}),
    ...(runtimeData.environment || {}),
  };

  // Helper to capitalize first letter
  const capitalizeFirst = (str: string): string =>
    str.charAt(0).toUpperCase() + str.slice(1);

  // Install command: from pinacleConfig or template
  const installCommand = pinacleConfig.install || template?.installCommand;

  // Processes: from pinacleConfig or template defaults
  const configProcesses =
    pinacleConfig.processes && pinacleConfig.processes.length > 0
      ? pinacleConfig.processes
      : template?.defaultProcesses || [];

  const processes = configProcesses.map((p) => ({
    ...p,
    displayName: p.displayName || capitalizeFirst(p.name),
    tmuxSession: `process-${runtimeData.id}-${p.name}`,
  }));

  // Build complete PodSpec
  const podSpec: import("./types").PodSpec = {
    id: runtimeData.id,
    name: runtimeData.name,
    slug: runtimeData.slug,
    description: runtimeData.description,
    templateId: pinacleConfig.template,
    baseImage,
    resources: {
      tier: pinacleConfig.tier,
      cpuCores: resources.cpuCores,
      memoryMb: resources.memoryMb,
      storageMb: resources.storageMb,
    },
    network: {
      ports: [],
      allowEgress: true,
    },
    services,
    environment,
    installCommand,
    processes,
    githubRepo: runtimeData.githubRepo,
    githubBranch: runtimeData.githubBranch,
    githubRepoSetup: runtimeData.githubRepoSetup,
    workingDir: "/workspace",
    user: "root",
  };

  return podSpec;
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

  // Extract processes (remove tmuxSession as it's runtime-only)
  const processes =
    podConfig.processes?.map((p) => ({
      name: p.name,
      displayName: p.displayName,
      startCommand: p.startCommand,
      url: p.url,
      healthCheck: p.healthCheck,
    })) || [];

  // Generate tabs from services
  const tabs = generateDefaultTabs(services, podConfig.slug);

  // Build PinacleConfig
  const pinacleConfig: PinacleConfig = {
    version: "1.0",
    tier,
    services,
    processes,
    tabs, // Include auto-generated tabs
  };

  // Add optional fields if present
  if (podConfig.templateId) {
    pinacleConfig.template = podConfig.templateId;
  }

  if (podConfig.installCommand) {
    pinacleConfig.install = podConfig.installCommand;
  }

  return pinacleConfig;
};
