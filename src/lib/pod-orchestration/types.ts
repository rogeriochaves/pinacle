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
  image?: string; // Docker image for the service
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

export interface PodConfig {
  id: string;
  name: string;
  slug: string;
  description?: string;

  // Template and base configuration
  templateId?: string;
  baseImage: string; // Base container image

  // Resource allocation
  resources: ResourceConfig;

  // Networking
  network: NetworkConfig;

  // Services to run in the pod
  services: ServiceConfig[];

  // Environment variables
  environment: Record<string, string>;
  secrets?: Record<string, string>;

  // GitHub integration
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

  // Runtime configuration
  workingDir?: string;
  user?: string; // User to run as inside container

  // Lifecycle configuration
  hooks?: {
    preStart?: string[];
    postStart?: string[];
    preStop?: string[];
    postStop?: string[];
  };

  // Monitoring
  healthChecks?: Array<{
    name: string;
    type: "http" | "tcp" | "command";
    config: HealthCheckConfig;
    interval: number;
    timeout: number;
  }>;
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
  config: PodConfig;
  status: PodStatus;
  container?: ContainerInfo;
  hostInfo?: {
    hostId: string;
    hostIp: string;
    sshPort?: number;
  };
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
    options?: { sudo?: boolean; label?: string; containerCommand?: string },
  ): Promise<{ stdout: string; stderr: string }>;

  // Test connection
  testConnection(): Promise<boolean>;

  // Set pod ID for logging context
  setPodId(podId: string): void;
}

// Lima integration types
export interface LimaConfig {
  vmName: string;
  sshPort?: number;
  dockerSocket?: string;
}

export interface ContainerRuntime {
  // Container lifecycle
  createContainer(config: PodConfig): Promise<ContainerInfo>;
  startContainer(containerId: string): Promise<void>;
  stopContainer(containerId: string): Promise<void>;
  removeContainer(containerId: string): Promise<void>;

  // Container inspection
  getContainer(containerId: string): Promise<ContainerInfo | null>;
  listContainers(filters?: Record<string, string>): Promise<ContainerInfo[]>;

  // Container execution
  execCommand(
    containerId: string,
    command: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;

  // Logs
  getContainerLogs(
    containerId: string,
    options?: { tail?: number; follow?: boolean },
  ): Promise<string>;
}

export interface NetworkManager {
  // Network setup
  createPodNetwork(podId: string, config: NetworkConfig): Promise<string>; // Returns pod IP
  destroyPodNetwork(podId: string): Promise<void>;

  // Port management
  allocatePort(podId: string, service: string): Promise<number>;
  releasePort(podId: string, port: number): Promise<void>;

  // Port forwarding
  setupPortForwarding(podId: string, mapping: PortMapping): Promise<void>;
  removePortForwarding(podId: string, mapping: PortMapping): Promise<void>;

  // Network policies
  applyNetworkPolicies(podId: string, policies: NetworkPolicy[]): Promise<void>;
}

export interface ServiceProvisioner {
  // Service lifecycle
  provisionService(
    podId: string,
    service: ServiceConfig,
    projectFolder?: string,
  ): Promise<void>;
  startService(podId: string, serviceName: string): Promise<void>;
  stopService(podId: string, serviceName: string): Promise<void>;
  removeService(podId: string, serviceName: string): Promise<void>;

  // Service status
  getServiceStatus(
    podId: string,
    serviceName: string,
  ): Promise<"running" | "stopped" | "failed">;
  getServiceLogs(
    podId: string,
    serviceName: string,
    options?: { tail?: number },
  ): Promise<string>;

  // Health checks
  checkServiceHealth(podId: string, serviceName: string): Promise<boolean>;
}

export interface ConfigResolver {
  // Configuration loading and merging
  loadConfig(
    templateId?: string,
    userConfig?: Partial<PodConfig>,
  ): Promise<PodConfig>;
  validateConfig(
    config: PodConfig,
  ): Promise<{ valid: boolean; errors: string[] }>;

  // Auto-detection
  detectProjectType(repoPath: string): Promise<{
    type: string;
    confidence: number;
    suggestions: Partial<PodConfig>;
  }>;

  // Template management
  getTemplate(templateId: string): Promise<Partial<PodConfig> | null>;
  listTemplates(): Promise<
    Array<{ id: string; name: string; description: string }>
  >;
}

export interface PodManager {
  // Pod lifecycle
  createPod(config: PodConfig): Promise<PodInstance>;
  startPod(podId: string): Promise<void>;
  stopPod(podId: string): Promise<void>;
  deletePod(podId: string): Promise<void>;

  // Pod management
  getPod(podId: string): Promise<PodInstance | null>;
  listPods(
    filters?: Record<string, string | boolean | number>,
  ): Promise<PodInstance[]>;

  // Pod operations
  execInPod(
    podId: string,
    command: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  getPodLogs(
    podId: string,
    options?: { tail?: number; follow?: boolean },
  ): Promise<string>;

  // Health and monitoring
  checkPodHealth(podId: string): Promise<boolean>;
  getPodMetrics(podId: string): Promise<{
    cpu: { usage: number; limit: number };
    memory: { usage: number; limit: number };
    network: { rx: number; tx: number };
    disk: { usage: number; limit: number };
  }>;

  // Hibernation
  hibernatePod(podId: string): Promise<void>;
  wakePod(podId: string): Promise<void>;
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
