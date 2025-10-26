import type { TemplateId } from "./template-registry";

export type PodStatus =
  | "pending"
  | "provisioning"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "hibernating"
  | "hibernated"
  | "waking"
  | "failed"
  | "terminating";

export type ResourceTier =
  | "dev.small"
  | "dev.medium"
  | "dev.large"
  | "dev.xlarge";

export interface ResourceConfig {
  tier: ResourceTier;
  cpuCores: number;
  memoryMb: number;
  storageMb: number;
  // Runtime-specific limits for gVisor
  cpuQuota?: number; // CPU quota in microseconds per period
  cpuPeriod?: number; // CPU period in microseconds
  memorySwap?: number; // Memory + swap limit
  diskQuota?: number; // Disk quota in bytes
}

export interface PortMapping {
  name: string;
  internal: number;
  external?: number; // Auto-assigned if not specified
  protocol: "tcp" | "udp";
  public?: boolean; // Allow public access without auth
  subdomain?: string; // Custom subdomain prefix
}

export interface NetworkConfig {
  podIp?: string; // Internal pod IP
  gatewayIp?: string; // Gateway IP for pod network
  subnet?: string; // Pod subnet (e.g., "10.100.1.0/24")
  ports: PortMapping[];
  // DNS configuration
  dns?: string[];
  // Network policies
  allowEgress?: boolean;
  allowedDomains?: string[];
  bandwidthLimit?: number; // Mbps
}

export interface ServiceConfig {
  name: string;
  enabled: boolean;
  command?: string[];
  environment?: Record<string, string>;
  ports?: PortMapping[];
  healthCheck?: {
    path?: string;
    port?: number;
    interval?: number; // seconds
    timeout?: number; // seconds
    retries?: number;
  };
  autoRestart?: boolean;
  dependsOn?: string[]; // Service dependencies
}

export interface ProcessConfig {
  name: string;
  displayName?: string;
  startCommand: string | string[];
  url?: string;
  healthCheck?: string | string[];
  tmuxSession?: string; // Generated session name
}

/**
 * PodSpec is a superset of PinacleConfig with additional runtime fields.
 * It includes all user-facing config (from pinacle.yaml) plus runtime expansion.
 *
 * This ensures lossless conversion: PodSpec → PinacleConfig → PodSpec
 */
export interface PodSpec
  extends Omit<
    import("./pinacle-config").PinacleConfig,
    "services" | "install"
  > {
  // Runtime ID fields
  id: string;
  name: string;
  slug: string;
  description?: string;

  // Template and base configuration
  templateId?: TemplateId;
  baseImage: string; // Base container image

  // Resource allocation (expanded from tier)
  resources: ResourceConfig;

  // Networking (runtime assigned)
  network: NetworkConfig;

  // Services (expanded from PinacleConfig.services: string[] → ServiceConfig[])
  services: ServiceConfig[];

  // Install command (same as PinacleConfig.install, just renamed for clarity)
  installCommand?: string | string[];

  // Environment variables (runtime merged)
  environment: Record<string, string>;
  secrets?: Record<string, string>;

  // GitHub integration (runtime expanded)
  githubRepo?: string;
  githubBranch?: string;
  sshKeyPath?: string;
  githubRepoSetup?: {
    type: "existing" | "new";
    sshKeyPair: {
      publicKey: string;
      privateKey: string;
      fingerprint: string;
    };
    deployKeyId?: number;
  };
  hasPinacleYaml?: boolean; // Flag to skip pinacle.yaml injection if repo already has one

  // Runtime configuration
  workingDir?: string;
  user?: string; // User to run as inside container

  // TODO: those belong to pinacle.yaml, maybe
  // // Lifecycle configuration
  // hooks?: {
  //   preStart?: string[];
  //   postStart?: string[];
  //   preStop?: string[];
  //   postStop?: string[];
  // };

  // // Monitoring
  // healthChecks?: Array<{
  //   name: string;
  //   type: "http" | "tcp" | "command";
  //   config: HealthCheckConfig;
  //   interval: number;
  //   timeout: number;
  // }>;
}

export type HealthCheckConfig =
  | {
      type: "http";
      path: string;
      port: number;
      method?: string;
      expectedStatus?: number;
    }
  | {
      type: "tcp";
      host: string;
      port: number;
    }
  | {
      type: "command";
      command: string[];
      expectedExitCode?: number;
    };

export interface ContainerInfo {
  id: string;
  name: string;
  status: "created" | "running" | "paused" | "stopped" | "dead";
  podId: string;
  internalIp?: string;
  ports: PortMapping[];
  createdAt: Date;
  startedAt?: Date;
  stoppedAt?: Date;
}

export interface PodInstance {
  id: string;
  spec: PodSpec;
  status: PodStatus;
  container?: ContainerInfo;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  lastHealthCheck?: Date;
}

// Server connection types
export interface ServerConnectionConfig {
  host: string;
  port: number;
  user: string;
  privateKey: string; // SSH private key content
}

export interface ServerConnection {
  // Execute command on the server (not inside a container)
  exec(
    command: string,
    options?: {
      sudo?: boolean;
      label?: string;
      containerCommand?: ContainerCommand;
    },
  ): Promise<{ stdout: string; stderr: string }>;

  // Test connection
  testConnection(): Promise<boolean>;
}

export interface ContainerCommand {
  podId: string;
  command: string;
}

// Lima integration types
export interface LimaConfig {
  vmName: string;
  sshPort: number; // Required - must be retrieved via getLimaSshPort() helper
  dockerSocket?: string;
}

export interface ConfigResolver {
  // Configuration loading and merging
  loadConfig(
    templateId?: TemplateId,
    userConfig?: Partial<PodSpec>,
  ): Promise<PodSpec>;
  validateConfig(spec: PodSpec): Promise<{ valid: boolean; errors: string[] }>;

  // Auto-detection
  detectProjectType(repoPath: string): Promise<{
    type: string;
    confidence: number;
    suggestions: Partial<PodSpec>;
  }>;

  // Template management
  getTemplate(templateId: TemplateId): Promise<Partial<PodSpec> | null>;
  listTemplates(): Promise<
    Array<{ id: string; name: string; description: string }>
  >;
}

// Event types for pod lifecycle
export type NetworkPolicyType = "egress" | "ingress" | "bandwidth";

export type NetworkPolicy =
  | {
      type: "egress";
      allowed: boolean;
      domains: string[];
    }
  | {
      type: "ingress";
      allowed: boolean;
      sources?: string[];
    }
  | {
      type: "bandwidth";
      limit: number;
    };

export interface PodEvent {
  podId: string;
  type:
    | "created"
    | "started"
    | "stopped"
    | "failed"
    | "deleted"
    | "health_check";
  timestamp: Date;
  data?: Record<string, unknown>;
  error?: string;
}

export type PodEventHandler = (event: PodEvent) => void | Promise<void>;
