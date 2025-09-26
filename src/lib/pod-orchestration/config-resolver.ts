import { z } from "zod";
import type {
  ConfigResolver,
  PodConfig,
  ResourceTier,
  ServiceConfig,
} from "./types";

// Validation schemas
const PortMappingSchema = z.object({
  name: z.string(),
  internal: z.number().min(1).max(65535),
  external: z.number().min(1).max(65535).optional(),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
  public: z.boolean().optional().default(false),
  subdomain: z.string().optional(),
});

const ServiceConfigSchema = z.object({
  name: z.string(),
  enabled: z.boolean().optional().default(true),
  image: z.string().optional(),
  command: z.array(z.string()).optional(),
  environment: z.record(z.string(), z.string()).optional().default({}),
  ports: z.array(PortMappingSchema).optional().default([]),
  healthCheck: z
    .object({
      path: z.string().optional(),
      port: z.number().optional(),
      interval: z.number().optional().default(30),
      timeout: z.number().optional().default(5),
      retries: z.number().optional().default(3),
    })
    .optional(),
  autoRestart: z.boolean().optional().default(true),
  dependsOn: z.array(z.string()).optional().default([]),
});

const PodConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  templateId: z.string().optional(),
  baseImage: z.string().default("alpine:3.22.1"),
  resources: z.object({
    tier: z.enum(["dev.small", "dev.medium", "dev.large", "dev.xlarge"]),
    cpuCores: z.number().min(0.25).max(8),
    memoryMb: z.number().min(256).max(16384),
    storageMb: z.number().min(1024).max(100000),
  }),
  network: z.object({
    podIp: z.string().optional(),
    gatewayIp: z.string().optional(),
    subnet: z.string().optional(),
    ports: z.array(PortMappingSchema),
    dns: z.array(z.string()).optional(),
    allowEgress: z.boolean().default(true),
    allowedDomains: z.array(z.string()).optional(),
    bandwidthLimit: z.number().optional(),
  }),
  services: z.array(ServiceConfigSchema),
  environment: z.record(z.string()).default({}),
  secrets: z.record(z.string()).optional(),
  githubRepo: z.string().optional(),
  githubBranch: z.string().default("main"),
  sshKeyPath: z.string().optional(),
  workingDir: z.string().default("/workspace"),
  user: z.string().default("root"),
  hooks: z
    .object({
      preStart: z.array(z.string()).optional(),
      postStart: z.array(z.string()).optional(),
      preStop: z.array(z.string()).optional(),
      postStop: z.array(z.string()).optional(),
    })
    .optional(),
  healthChecks: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["http", "tcp", "command"]),
        config: z.any(),
        interval: z.number(),
        timeout: z.number(),
      }),
    )
    .default([]),
});

interface PodTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  baseImage: string;
  services: ServiceConfig[];
  defaultPorts: Array<{ name: string; internal: number; external?: number }>;
  environment: Record<string, string>;
  resources: {
    tier: ResourceTier;
    cpuCores: number;
    memoryMb: number;
    storageMb: number;
  };
}

export class DefaultConfigResolver implements ConfigResolver {
  private templates: Map<string, PodTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    // Next.js template
    this.templates.set("nextjs", {
      id: "nextjs",
      name: "Next.js Development",
      description: "Full-stack React development with Next.js",
      category: "nextjs",
      baseImage: "node:24-alpine",
      services: [
        {
          name: "code-server",
          enabled: true,
          ports: [{ name: "code", internal: 8080, protocol: "tcp" }],
          autoRestart: true,
          dependsOn: [],
        },
        {
          name: "vibe-kanban",
          enabled: true,
          ports: [{ name: "kanban", internal: 57300, protocol: "tcp" }],
          autoRestart: true,
          dependsOn: [],
        },
        {
          name: "web-terminal",
          enabled: true,
          ports: [{ name: "terminal", internal: 3003, protocol: "tcp" }],
          autoRestart: true,
          dependsOn: [],
        },
      ],
      defaultPorts: [
        { name: "app", internal: 3000 },
        { name: "code", internal: 8080 },
        { name: "kanban", internal: 57300 },
        { name: "terminal", internal: 3003 },
      ],
      environment: {
        NODE_ENV: "development",
        PORT: "3000",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      resources: {
        tier: "dev.small",
        cpuCores: 1,
        memoryMb: 1024,
        storageMb: 10240,
      },
    });

    // Mastra AI Agent template
    this.templates.set("mastra", {
      id: "mastra",
      name: "Mastra AI Agent",
      description: "Build AI agents with Mastra framework",
      category: "mastra",
      baseImage: "python:3.11-alpine",
      services: [
        {
          name: "code-server",
          enabled: true,
          ports: [{ name: "code", internal: 8080, protocol: "tcp" }],
          autoRestart: true,
          dependsOn: [],
        },
        {
          name: "vibe-kanban",
          enabled: true,
          ports: [{ name: "kanban", internal: 57300, protocol: "tcp" }],
          autoRestart: true,
          dependsOn: [],
        },
        {
          name: "web-terminal",
          enabled: true,
          ports: [{ name: "terminal", internal: 3003, protocol: "tcp" }],
          autoRestart: true,
          dependsOn: [],
        },
      ],
      defaultPorts: [
        { name: "app", internal: 8000 },
        { name: "code", internal: 8080 },
        { name: "kanban", internal: 57300 },
        { name: "terminal", internal: 3003 },
      ],
      environment: {
        PYTHON_ENV: "development",
        PYTHONPATH: "/workspace",
      },
      resources: {
        tier: "dev.medium",
        cpuCores: 1.5,
        memoryMb: 2048,
        storageMb: 15360,
      },
    });

    // Custom Ubuntu template
    this.templates.set("custom", {
      id: "custom",
      name: "Custom Ubuntu",
      description: "Start with a blank Ubuntu environment",
      category: "custom",
      baseImage: "alpine:3.22.1",
      services: [
        {
          name: "code-server",
          enabled: true,
          ports: [{ name: "code", internal: 8080, protocol: "tcp" }],
          autoRestart: true,
          dependsOn: [],
        },
        {
          name: "web-terminal",
          enabled: true,
          ports: [{ name: "terminal", internal: 3003, protocol: "tcp" }],
          autoRestart: true,
          dependsOn: [],
        },
      ],
      defaultPorts: [
        { name: "code", internal: 8080 },
        { name: "terminal", internal: 3003 },
      ],
      environment: {},
      resources: {
        tier: "dev.small",
        cpuCores: 0.5,
        memoryMb: 512,
        storageMb: 5120,
      },
    });

    // Python Data Science template
    this.templates.set("datascience", {
      id: "datascience",
      name: "Python Data Science",
      description: "Python environment with Jupyter, pandas, and ML libraries",
      category: "datascience",
      baseImage: "python:3.11-alpine",
      services: [
        {
          name: "code-server",
          enabled: true,
          ports: [{ name: "code", internal: 8080, protocol: "tcp" }],
          autoRestart: true,
          dependsOn: [],
        },
        {
          name: "web-terminal",
          enabled: true,
          ports: [{ name: "terminal", internal: 3003, protocol: "tcp" }],
          autoRestart: true,
          dependsOn: [],
        },
      ],
      defaultPorts: [
        { name: "jupyter", internal: 8888 },
        { name: "code", internal: 8080 },
        { name: "terminal", internal: 3003 },
      ],
      environment: {
        JUPYTER_ENABLE_LAB: "yes",
        JUPYTER_TOKEN: "",
      },
      resources: {
        tier: "dev.large",
        cpuCores: 2,
        memoryMb: 4096,
        storageMb: 20480,
      },
    });

    // Node.js Backend template
    this.templates.set("nodejs", {
      id: "nodejs",
      name: "Node.js Backend",
      description: "Node.js backend development environment",
      category: "nodejs",
      baseImage: "node:24-alpine",
      services: [
        {
          name: "code-server",
          enabled: true,
          ports: [{ name: "code", internal: 8080, protocol: "tcp" }],
          autoRestart: true,
          dependsOn: [],
        },
        {
          name: "web-terminal",
          enabled: true,
          ports: [{ name: "terminal", internal: 3003, protocol: "tcp" }],
          autoRestart: true,
          dependsOn: [],
        },
      ],
      defaultPorts: [
        { name: "api", internal: 8000 },
        { name: "code", internal: 8080 },
        { name: "terminal", internal: 3003 },
      ],
      environment: {
        NODE_ENV: "development",
        PORT: "8000",
      },
      resources: {
        tier: "dev.medium",
        cpuCores: 1,
        memoryMb: 1536,
        storageMb: 10240,
      },
    });
  }

  async loadConfig(
    templateId?: string,
    userConfig?: Partial<PodConfig>,
  ): Promise<PodConfig> {
    let baseConfig: Partial<PodConfig> = {};

    // Load template if specified
    if (templateId) {
      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      baseConfig = this.templateToPodConfig(template);
    }

    // Merge with user configuration
    const mergedConfig = this.mergeConfigs(baseConfig, userConfig || {});

    // Ensure required fields are present
    const finalConfig: PodConfig = {
      id: mergedConfig.id || this.generateId(),
      name: mergedConfig.name || "Unnamed Pod",
      slug:
        mergedConfig.slug ||
        this.generateSlug(mergedConfig.name || "unnamed-pod"),
      description: mergedConfig.description,
      templateId,
      baseImage: mergedConfig.baseImage || "alpine:3.22.1",
      resources: {
        tier: (mergedConfig.resources?.tier || "dev.small") as ResourceTier,
        cpuCores: mergedConfig.resources?.cpuCores || 1,
        memoryMb: mergedConfig.resources?.memoryMb || 1024,
        storageMb: mergedConfig.resources?.storageMb || 10240,
      },
      network: {
        ports: mergedConfig.network?.ports || [],
        podIp: mergedConfig.network?.podIp,
        gatewayIp: mergedConfig.network?.gatewayIp,
        subnet: mergedConfig.network?.subnet,
        dns: mergedConfig.network?.dns,
        allowEgress: mergedConfig.network?.allowEgress ?? true,
        allowedDomains: mergedConfig.network?.allowedDomains,
        bandwidthLimit: mergedConfig.network?.bandwidthLimit,
      },
      services: mergedConfig.services || [],
      environment: mergedConfig.environment || {},
      secrets: mergedConfig.secrets,
      githubRepo: mergedConfig.githubRepo,
      githubBranch: mergedConfig.githubBranch || "main",
      sshKeyPath: mergedConfig.sshKeyPath,
      workingDir: mergedConfig.workingDir || "/workspace",
      user: mergedConfig.user || "root",
      hooks: mergedConfig.hooks,
      healthChecks: mergedConfig.healthChecks || [],
    };

    return finalConfig;
  }

  async validateConfig(
    config: PodConfig,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Basic validation without Zod for now
    if (!config.id) {
      errors.push("Pod ID is required");
    }
    if (!config.name) {
      errors.push("Pod name is required");
    }
    if (!config.baseImage) {
      errors.push("Base image is required");
    }

    // Additional validation logic
    this.validatePortConflicts(config, errors);
    this.validateResourceLimits(config, errors);
    this.validateServiceDependencies(config, errors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async detectProjectType(repoPath: string): Promise<{
    type: string;
    confidence: number;
    suggestions: Partial<PodConfig>;
  }> {
    // This is a simplified version - in a real implementation,
    // you'd analyze the repository structure and files

    // For now, return a basic detection based on common patterns
    const suggestions: Partial<PodConfig> = {
      baseImage: "alpine:3.22.1",
      resources: {
        tier: "dev.small" as ResourceTier,
        cpuCores: 1,
        memoryMb: 1024,
        storageMb: 10240,
      },
    };

    // Mock detection logic
    if (repoPath.includes("next") || repoPath.includes("react")) {
      return {
        type: "nextjs",
        confidence: 0.8,
        suggestions: {
          ...suggestions,
          templateId: "nextjs",
          baseImage: "node:24-alpine",
          environment: {
            NODE_ENV: "development",
            PORT: "3000",
          },
        },
      };
    }

    if (repoPath.includes("python") || repoPath.includes("py")) {
      return {
        type: "python",
        confidence: 0.7,
        suggestions: {
          ...suggestions,
          baseImage: "python:3.11-alpine",
          environment: {
            PYTHON_ENV: "development",
            PYTHONPATH: "/workspace",
          },
        },
      };
    }

    return {
      type: "custom",
      confidence: 0.5,
      suggestions,
    };
  }

  async getTemplate(templateId: string): Promise<Partial<PodConfig> | null> {
    const template = this.templates.get(templateId);
    if (!template) {
      return null;
    }

    return this.templateToPodConfig(template);
  }

  async listTemplates(): Promise<
    Array<{ id: string; name: string; description: string }>
  > {
    return Array.from(this.templates.values()).map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
    }));
  }

  // Private helper methods
  private templateToPodConfig(template: PodTemplate): Partial<PodConfig> {
    return {
      templateId: template.id,
      baseImage: template.baseImage,
      services: template.services,
      environment: template.environment,
      resources: template.resources,
      network: {
        ports: template.defaultPorts.map((port) => ({
          name: port.name,
          internal: port.internal,
          external: port.external,
          protocol: "tcp" as const,
        })),
      },
    };
  }

  private mergeConfigs(
    base: Partial<PodConfig>,
    user: Partial<PodConfig>,
  ): Partial<PodConfig> {
    return {
      ...base,
      ...user,
      resources: {
        ...base.resources,
        ...user.resources,
      },
      network: {
        ...base.network,
        ...user.network,
        ports: user.network?.ports || base.network?.ports || [],
      },
      environment: {
        ...base.environment,
        ...user.environment,
      },
      services: user.services || base.services || [],
      hooks: {
        ...base.hooks,
        ...user.hooks,
      },
    };
  }

  private validatePortConflicts(config: PodConfig, errors: string[]): void {
    const usedPorts = new Set<number>();

    for (const port of config.network.ports) {
      if (usedPorts.has(port.internal)) {
        errors.push(
          `Port conflict: internal port ${port.internal} is used multiple times`,
        );
      }
      usedPorts.add(port.internal);
    }

    // Check service ports
    usedPorts.clear();
    for (const service of config.services) {
      for (const port of service.ports || []) {
        if (usedPorts.has(port.internal)) {
          errors.push(
            `Port conflict: service ${service.name} uses already allocated port ${port.internal}`,
          );
        }
        usedPorts.add(port.internal);
      }
    }
  }

  private validateResourceLimits(config: PodConfig, errors: string[]): void {
    const { resources } = config;

    // Validate tier-specific limits
    const tierLimits = {
      "dev.small": { maxCpu: 1, maxMemory: 1024 },
      "dev.medium": { maxCpu: 2, maxMemory: 2048 },
      "dev.large": { maxCpu: 4, maxMemory: 4096 },
      "dev.xlarge": { maxCpu: 8, maxMemory: 8192 },
    };

    const limits = tierLimits[resources.tier];
    if (limits) {
      if (resources.cpuCores > limits.maxCpu) {
        errors.push(
          `CPU cores (${resources.cpuCores}) exceed tier limit (${limits.maxCpu}) for ${resources.tier}`,
        );
      }
      if (resources.memoryMb > limits.maxMemory) {
        errors.push(
          `Memory (${resources.memoryMb}MB) exceeds tier limit (${limits.maxMemory}MB) for ${resources.tier}`,
        );
      }
    }
  }

  private validateServiceDependencies(
    config: PodConfig,
    errors: string[],
  ): void {
    const serviceNames = new Set(config.services.map((s) => s.name));

    for (const service of config.services) {
      for (const dependency of service.dependsOn || []) {
        if (!serviceNames.has(dependency)) {
          errors.push(
            `Service ${service.name} depends on non-existent service: ${dependency}`,
          );
        }
      }
    }
  }

  private generateId(): string {
    return `pod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
}
