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
  getServiceTemplateUnsafe,
  isCodingAssistant,
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
 * Can either reference a service (with optional custom URL) or be a pure custom URL
 */
const TabSchema = z.object({
  name: z.string(),
  service: z.string().optional(), // Optional service reference (e.g., "web-terminal", "code-server")
  url: z.string().optional(), // Optional custom URL override (defaults to service's default port if service is specified)
});

/**
 * Process configuration for user applications
 */
const ProcessSchema = z.object({
  name: z.string(),
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
  processes: z.array(ProcessSchema).optional(),

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
  ].join("\n");

  // Clean up empty arrays to avoid writing them to YAML
  const cleanConfig = { ...config };
  if (cleanConfig.processes && cleanConfig.processes.length === 0) {
    delete cleanConfig.processes;
  }
  if (cleanConfig.tabs && cleanConfig.tabs.length === 0) {
    delete cleanConfig.tabs;
  }

  // Serialize using js-yaml for proper YAML formatting
  const yamlContent = yaml.dump(cleanConfig, {
    indent: 2,
    lineWidth: 80,
    noRefs: true,
    sortKeys: false,
    quotingType: '"', // Use double quotes for strings
    forceQuotes: false, // Only quote when necessary
    skipInvalid: true, // Skip undefined values
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
  tabs?: Array<{ name: string; url?: string; service?: string }>;
  slug?: string;
  processes?: Array<{
    name: string;
    startCommand: string | string[];
    url?: string;
    healthCheck?: string | string[];
  }>;
  processConfig?: {
    installCommand?: string;
    startCommand?: string;
    appUrl?: string;
  };
}): PinacleConfig => {
  // Get template if specified
  const template = formData.template
    ? getTemplateUnsafe(formData.template)
    : undefined;

  // Determine services:
  // 1. Use customServices if explicitly provided
  // 2. Otherwise, if template is provided, use template's services
  // 3. Otherwise, fall back to defaults
  const services =
    formData.customServices && formData.customServices.length > 0
      ? formData.customServices
      : template?.services || DEFAULT_PINACLE_CONFIG.services;

  // Determine processes:
  // 1. If full processes provided (from existing pinacle.yaml), use those to preserve all fields
  // 2. Else if processConfig provided (simplified form), create basic process
  // 3. Otherwise, use template's defaultProcesses if available
  const processes: Array<{
    name: string;
    startCommand: string | string[];
    url?: string;
    healthCheck?: string | string[];
  }> = [];

  if (formData.processes && formData.processes.length > 0) {
    // Existing repo with full process data: preserve everything (including healthCheck)
    processes.push(...formData.processes);
  } else if (formData.processConfig?.startCommand) {
    // Existing repo with simplified form data: create basic process
    processes.push({
      name: "app",
      startCommand: formData.processConfig.startCommand,
      url: formData.processConfig.appUrl,
    });
  } else if (template?.defaultProcesses) {
    // New template repo: use template's default processes
    processes.push(...template.defaultProcesses);
  }

  // Generate or patch tabs
  const tabs: Array<{ name: string; url?: string; service?: string }> = [];

  if (formData.tabs && formData.tabs.length > 0) {
    // Existing tabs: intelligently patch based on service changes
    tabs.push(...patchTabs(formData.tabs, services));
  } else {
    // No existing tabs: auto-generate from scratch
    // Order: 1. Process tabs (app URLs) FIRST, 2. Then service tabs

    // 1. Add process tabs for any processes with URLs
    for (const process of processes) {
      if (process.url) {
        tabs.push({
          name: process.name,
          url: process.url,
        });
      }
    }

    // 2. Add service tabs in preferred order
    tabs.push(...generateDefaultTabs(services, formData.slug || "pod"));
  }

  return PinacleConfigSchema.parse({
    version: "1.0",
    template: formData.template,
    tier: formData.tier || "dev.small",
    services,
    tabs: tabs.length > 0 ? tabs : undefined,
    install: formData.processConfig?.installCommand || template?.installCommand,
    processes,
  });
};

/**
 * Intelligently patch existing tabs based on service changes
 * - Replace coding assistant tab if coding assistant changed
 * - Remove tabs for services that no longer exist
 * - Add tabs for new services
 * - Keep all other tabs (process tabs, custom URLs, etc.) untouched
 */
export const patchTabs = (
  existingTabs: Array<{ name: string; url?: string; service?: string }>,
  newServices: string[],
): Array<{ name: string; url?: string; service?: string }> => {
  // Find new coding assistant
  const newCodingAssistant = newServices.find((s) => isCodingAssistant(s));

  // Get services that existed before (from existing tabs)
  const oldServices = new Set(
    existingTabs.filter((tab) => tab.service).map((tab) => tab.service!)
  );

  // Track which services we've seen
  const newServiceSet = new Set(newServices);
  const patchedTabs: Array<{ name: string; url?: string; service?: string }> = [];

  // Step 1: Iterate through existing tabs and keep/update them
  for (const tab of existingTabs) {
    if (!tab.service) {
      // Non-service tab (process tab, custom URL): always keep
      patchedTabs.push(tab);
    } else if (isCodingAssistant(tab.service)) {
      // Coding assistant tab: replace with new one if different
      if (newCodingAssistant && newCodingAssistant !== tab.service) {
        const template = getServiceTemplateUnsafe(newCodingAssistant);
        if (template) {
          patchedTabs.push({
            name: template.displayName,
            service: newCodingAssistant,
          });
        }
      } else if (newCodingAssistant === tab.service) {
        // Same coding assistant: keep it
        patchedTabs.push(tab);
      }
      // If no new coding assistant, drop the tab
    } else if (newServiceSet.has(tab.service)) {
      // Service still exists: keep the tab
      patchedTabs.push(tab);
    }
    // Service was removed: drop the tab
  }

  // Step 2: Add tabs for newly added services
  const existingServiceTabIds = new Set(
    patchedTabs.filter((tab) => tab.service).map((tab) => tab.service!)
  );

  for (const serviceName of newServices) {
    if (!existingServiceTabIds.has(serviceName) && !oldServices.has(serviceName)) {
      // New service: add a tab for it
      const template = getServiceTemplateUnsafe(serviceName);
      if (template) {
        patchedTabs.push({
          name: template.displayName,
          service: serviceName,
        });
      }
    }
  }

  return patchedTabs;
};

/**
 * Generate default tabs from services
 * Creates tabs that reference services so they get proper icons and can be managed
 * Order: Coding assistant, VS Code, Terminal, Vibe Kanban, others
 */
export const generateDefaultTabs = (
  services: string[],
  _podSlug: string,
): Array<{ name: string; url?: string; service?: string }> => {
  const tabs: Array<{ name: string; url?: string; service?: string }> = [];

  // Define the preferred order for service tabs
  const serviceOrder = [
    "claude-code",
    "openai-codex",
    "cursor-cli",
    "gemini-cli",
    "code-server",
    "web-terminal",
    "vibe-kanban",
  ];

  // Add service tabs in preferred order
  for (const serviceName of serviceOrder) {
    if (services.includes(serviceName)) {
      const template = getServiceTemplateUnsafe(serviceName);
      if (template) {
        tabs.push({
          name: template.displayName,
          service: serviceName,
        });
      }
    }
  }

  // Add any remaining services not in the preferred order
  for (const serviceName of services) {
    if (!serviceOrder.includes(serviceName)) {
      const template = getServiceTemplateUnsafe(serviceName);
      if (template) {
        tabs.push({
          name: template.displayName,
          service: serviceName,
        });
      }
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
 * Get tabs from pod config
 * Note: This function is deprecated. The workbench now auto-generates tabs from:
 * 1. config.services (for service tabs)
 * 2. config.processes (for process tabs with URLs)
 * 3. config.tabs (for custom tabs)
 */
export const getTabsFromConfig = (
  config: PinacleConfig,
  podSlug: string,
): Array<{ name: string; url?: string; service?: string }> => {
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
    hasPinacleYaml?: boolean;
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

  // Install command: from pinacleConfig or template
  const installCommand = pinacleConfig.install || template?.installCommand;

  // Processes: from pinacleConfig or template defaults
  const configProcesses =
    pinacleConfig.processes && pinacleConfig.processes.length > 0
      ? pinacleConfig.processes
      : template?.defaultProcesses || [];

  const processes = configProcesses.map((p) => ({
    ...p,
    tmuxSession: `process-${runtimeData.id}-${p.name}`,
  }));

  // Build complete PodSpec
  // PodSpec extends PinacleConfig, so include all PinacleConfig fields
  const podSpec: import("./types").PodSpec = {
    // PinacleConfig fields (preserved as-is)
    version: pinacleConfig.version,
    template: pinacleConfig.template,
    tabs: pinacleConfig.tabs,

    // Runtime ID fields
    id: runtimeData.id,
    name: runtimeData.name,
    slug: runtimeData.slug,
    description: runtimeData.description,

    // Runtime expansion
    templateId: pinacleConfig.template,
    baseImage,
    tier: pinacleConfig.tier,
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
    hasPinacleYaml: runtimeData.hasPinacleYaml,
    workingDir: "/workspace",
    user: "root",
  };

  return podSpec;
};

/**
 * Convert PodSpec (runtime config) to PinacleConfig (YAML config)
 *
 * Since PodSpec extends PinacleConfig, this is now a simple extraction of the
 * PinacleConfig fields from the expanded PodSpec. No data loss!
 */
export const podConfigToPinacleConfig = (
  podConfig: import("./types").PodSpec,
): PinacleConfig => {
  // Extract service names from ServiceConfig array (services is expanded in PodSpec)
  const services = podConfig.services.map((service) => service.name);

  // Extract processes (remove tmuxSession as it's runtime-only)
  const processes = podConfig.processes?.map((p) => ({
    name: p.name,
    startCommand: p.startCommand,
    url: p.url,
    healthCheck: p.healthCheck,
  }));

  // Build PinacleConfig by extracting fields from PodSpec
  // PodSpec extends PinacleConfig, so all fields are already there!
  const pinacleConfig: PinacleConfig = {
    version: podConfig.version,
    tier: podConfig.tier,
    services,
    template: podConfig.templateId || podConfig.template,
    install: podConfig.installCommand, // installCommand is the expanded version of install
    processes,
    tabs: podConfig.tabs, // Now preserved automatically!
  };

  return pinacleConfig;
};
