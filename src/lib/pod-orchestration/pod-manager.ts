import { EventEmitter } from "node:events";
import { DefaultConfigResolver } from "./config-resolver";

import { LimaGVisorRuntime } from "./container-runtime";
import { GitHubIntegration, type GitHubRepoSetup } from "./github-integration";
import { LimaNetworkManager } from "./network-manager";
import { LimaServiceProvisioner } from "./service-provisioner";
import { getTemplateUnsafe } from "./template-registry";
import type {
  ConfigResolver,
  ContainerRuntime,
  LimaConfig,
  NetworkManager,
  PodConfig,
  PodEvent,
  PodEventHandler,
  PodInstance,
  PodManager,
  PodStatus,
  ServiceConfig,
  ServiceProvisioner,
} from "./types";

export class DefaultPodManager extends EventEmitter implements PodManager {
  private pods: Map<string, PodInstance> = new Map();
  // Store per-pod components for operations after creation
  private podComponents: Map<string, {
    containerRuntime: ContainerRuntime;
    networkManager: NetworkManager;
    serviceProvisioner: ServiceProvisioner;
  }> = new Map();
  private limaConfig?: LimaConfig;
  private configResolver: ConfigResolver;
  private githubIntegration: GitHubIntegration;

  constructor(limaConfig?: LimaConfig) {
    super();

    this.limaConfig = limaConfig;
    this.configResolver = new DefaultConfigResolver();
    this.githubIntegration = new GitHubIntegration(this);
  }

  // Helper method to create pod-specific orchestration components
  private createPodComponents(podId: string) {
    const components = {
      containerRuntime: new LimaGVisorRuntime(this.limaConfig, undefined, podId),
      networkManager: new LimaNetworkManager(this.limaConfig, undefined, podId),
      serviceProvisioner: new LimaServiceProvisioner(this.limaConfig, undefined, podId),
    };
    this.podComponents.set(podId, components);
    return components;
  }

  // Get components for a pod (or create without podId for utility methods)
  private getComponents(podId?: string) {
    if (podId && this.podComponents.has(podId)) {
      return this.podComponents.get(podId)!;
    }
    // For utility methods without a pod context, create generic components
    return {
      containerRuntime: new LimaGVisorRuntime(this.limaConfig),
      networkManager: new LimaNetworkManager(this.limaConfig),
      serviceProvisioner: new LimaServiceProvisioner(this.limaConfig),
    };
  }

  async createPod(config: PodConfig): Promise<PodInstance> {
    console.log(`[PodManager] Creating pod: ${config.name} (${config.id})`);

    // Create pod-specific runtime, network manager, and service provisioner
    // They will log all commands with the pod ID
    const { containerRuntime, networkManager, serviceProvisioner } = this.createPodComponents(config.id);

    try {
      // Validate configuration
      const validation = await this.configResolver.validateConfig(config);
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(", ")}`);
      }

      // Create pod instance
      const podInstance: PodInstance = {
        id: config.id,
        config,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.pods.set(config.id, podInstance);
      this.emitEvent("created", config.id);
      // Update status to provisioning
      await this.updatePodStatus(config.id, "provisioning");

      // Create network
      console.log(`[PodManager] Creating network for pod ${config.id}`);
      const podIp = await networkManager.createPodNetwork(
        config.id,
        config.network,
      );

      // Update config with assigned IP
      config.network.podIp = podIp;

      // Allocate external ports
      console.log(`[PodManager] Allocating ports for pod ${config.id}`);
      await this.allocateExternalPorts(config, networkManager);

      // Create container
      console.log(`[PodManager] Creating container for pod ${config.id}`);
      const container = await containerRuntime.createContainer(config);

      // Update pod instance
      podInstance.container = container;
      podInstance.status = "starting";
      podInstance.updatedAt = new Date();

      // Start container
      console.log(`[PodManager] Starting container for pod ${config.id}`);
      await containerRuntime.startContainer(container.id);

      // Set up port forwarding
      console.log(`[PodManager] Setting up port forwarding for pod ${config.id}`);
      for (const port of config.network.ports) {
        if (port.external) {
          await networkManager.setupPortForwarding(config.id, port);
        }
      }

      // Setup GitHub repository if configured
      if (config.githubRepo && config.githubRepoSetup) {
        console.log(
          `[PodManager] Setting up GitHub repository for pod ${config.id}`,
        );
        await this.setupGitHubRepository(config.id, config);
      }

      // Provision services
      console.log(`[PodManager] Provisioning services for pod ${config.id}`);
      await this.provisionServices(config, serviceProvisioner);

      // Start services
      console.log(`[PodManager] Starting services for pod ${config.id}`);
      await this.startServices(config, serviceProvisioner);

      // Run post-start hooks
      if (config.hooks?.postStart) {
        console.log(`[PodManager] Running post-start hooks for pod ${config.id}`);
        await this.runHooks(config.id, config.hooks.postStart);
      }

      // Update status to running
      await this.updatePodStatus(config.id, "running");
      this.emitEvent("started", config.id);

      console.log(
        `[PodManager] Successfully created pod: ${config.name} (${config.id})`,
      );
      return podInstance;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PodManager] Pod creation failed: ${message}`);
      throw error;
    }
  }

  async startPod(podId: string): Promise<void> {
    const pod = this.pods.get(podId);
    if (!pod) {
      throw new Error(`Pod not found: ${podId}`);
    }

    if (pod.status === "running") {
      console.log(`[PodManager] Pod ${podId} is already running`);
      return;
    }

    if (!pod.container) {
      throw new Error(`Pod ${podId} has no container`);
    }

    console.log(`[PodManager] Starting pod: ${podId}`);

    const { containerRuntime, serviceProvisioner } = this.getComponents(podId);

    try {
      await this.updatePodStatus(podId, "starting");

      // Start container
      await containerRuntime.startContainer(pod.container.id);

      // Start services
      await this.startServices(pod.config, serviceProvisioner);

      // Run post-start hooks
      if (pod.config.hooks?.postStart) {
        await this.runHooks(podId, pod.config.hooks.postStart);
      }

      await this.updatePodStatus(podId, "running");
      this.emitEvent("started", podId);

      console.log(`[PodManager] Successfully started pod: ${podId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PodManager] Failed to start pod ${podId}: ${message}`);
      await this.updatePodStatus(podId, "failed", message);
      this.emitEvent("failed", podId, { error: message });
      throw error;
    }
  }

  async stopPod(podId: string): Promise<void> {
    const pod = this.pods.get(podId);
    if (!pod) {
      throw new Error(`Pod not found: ${podId}`);
    }

    if (pod.status === "stopped") {
      console.log(`[PodManager] Pod ${podId} is already stopped`);
      return;
    }

    if (!pod.container) {
      throw new Error(`Pod ${podId} has no container`);
    }

    console.log(`[PodManager] Stopping pod: ${podId}`);

    const { containerRuntime, serviceProvisioner } = this.getComponents(podId);

    try {
      await this.updatePodStatus(podId, "stopping");

      // Run pre-stop hooks
      if (pod.config.hooks?.preStop) {
        await this.runHooks(podId, pod.config.hooks.preStop);
      }

      // Stop services
      await this.stopServices(pod.config, serviceProvisioner);

      // Stop container
      await containerRuntime.stopContainer(pod.container.id);

      await this.updatePodStatus(podId, "stopped");
      this.emitEvent("stopped", podId);

      console.log(`[PodManager] Successfully stopped pod: ${podId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PodManager] Failed to stop pod ${podId}: ${message}`);
      await this.updatePodStatus(podId, "failed", message);
      this.emitEvent("failed", podId, { error: message });
      throw error;
    }
  }

  async deletePod(podId: string): Promise<void> {
    const pod = this.pods.get(podId);
    if (!pod) {
      throw new Error(`Pod not found: ${podId}`);
    }

    console.log(`[PodManager] Deleting pod: ${podId}`);

    const { containerRuntime, networkManager, serviceProvisioner } = this.getComponents(podId);

    try {
      await this.updatePodStatus(podId, "terminating");

      // Stop pod if running
      if (pod.status === "running") {
        await this.stopPod(podId);
      }

      // Run pre-stop hooks
      if (pod.config.hooks?.preStop) {
        await this.runHooks(podId, pod.config.hooks.preStop);
      }

      // Remove services
      await this.removeServices(pod.config, serviceProvisioner);

      // Remove container
      if (pod.container) {
        await containerRuntime.removeContainer(pod.container.id);
      }

      // Remove port forwarding
      for (const port of pod.config.network.ports) {
        if (port.external) {
          await networkManager.removePortForwarding(podId, port);
        }
      }

      // Destroy network
      await networkManager.destroyPodNetwork(podId);

      // Release allocated ports
      for (const port of pod.config.network.ports) {
        if (port.external) {
          await networkManager.releasePort(podId, port.external);
        }
      }

      // Remove pod from memory
      this.pods.delete(podId);
      this.podComponents.delete(podId);
      this.emitEvent("deleted", podId);

      console.log(`[PodManager] Successfully deleted pod: ${podId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PodManager] Failed to delete pod ${podId}: ${message}`);
      await this.updatePodStatus(podId, "failed", message);
      this.emitEvent("failed", podId, { error: message });
      throw error;
    }
  }

  async getPod(podId: string): Promise<PodInstance | null> {
    return this.pods.get(podId) || null;
  }

  async listPods(
    filters: Record<string, string | boolean | number> = {},
  ): Promise<PodInstance[]> {
    let pods = Array.from(this.pods.values());

    // Apply filters
    if (filters.status) {
      pods = pods.filter((pod) => pod.status === filters.status);
    }

    if (filters.templateId) {
      pods = pods.filter((pod) => pod.config.templateId === filters.templateId);
    }

    return pods;
  }

  async execInPod(
    podId: string,
    command: string[],
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    const pod = this.pods.get(podId);
    if (!pod || !pod.container) {
      throw new Error(`Pod not found or not running: ${podId}`);
    }

    const { containerRuntime } = this.getComponents(podId);
    return containerRuntime.execCommand(pod.container.id, command);
  }

  async getPodLogs(
    podId: string,
    options: { tail?: number; follow?: boolean } = {},
  ): Promise<string> {
    const pod = this.pods.get(podId);
    if (!pod || !pod.container) {
      throw new Error(`Pod not found or not running: ${podId}`);
    }

    const { containerRuntime } = this.getComponents(podId);
    return containerRuntime.getContainerLogs(pod.container.id, options);
  }

  async checkPodHealth(podId: string): Promise<boolean> {
    const pod = this.pods.get(podId);
    if (!pod || !pod.container) {
      return false;
    }

    const { containerRuntime, serviceProvisioner } = this.getComponents(podId);

    try {
      // Check container status
      const container = await containerRuntime.getContainer(
        pod.container.id,
      );
      if (!container || container.status !== "running") {
        return false;
      }

      // Check service health
      for (const service of pod.config.services) {
        if (service.enabled) {
          const isHealthy = await serviceProvisioner.checkServiceHealth(
            podId,
            service.name,
          );
          if (!isHealthy) {
            return false;
          }
        }
      }

      // Update last health check
      pod.lastHealthCheck = new Date();
      this.emitEvent("health_check", podId, { healthy: true });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[PodManager] Health check failed for pod ${podId}: ${message}`,
      );
      this.emitEvent("health_check", podId, {
        healthy: false,
        error: message,
      });
      return false;
    }
  }

  async getPodMetrics(podId: string): Promise<{
    cpu: { usage: number; limit: number };
    memory: { usage: number; limit: number };
    network: { rx: number; tx: number };
    disk: { usage: number; limit: number };
  }> {
    const pod = this.pods.get(podId);
    if (!pod || !pod.container) {
      throw new Error(`Pod not found or not running: ${podId}`);
    }

    // This is a simplified implementation
    // In a real system, you'd collect actual metrics from the container runtime
    return {
      cpu: {
        usage: Math.random() * 100, // Mock CPU usage percentage
        limit: pod.config.resources.cpuCores * 100,
      },
      memory: {
        usage: Math.random() * pod.config.resources.memoryMb, // Mock memory usage in MB
        limit: pod.config.resources.memoryMb,
      },
      network: {
        rx: Math.random() * 1000, // Mock network RX in KB/s
        tx: Math.random() * 1000, // Mock network TX in KB/s
      },
      disk: {
        usage: Math.random() * pod.config.resources.storageMb, // Mock disk usage in MB
        limit: pod.config.resources.storageMb,
      },
    };
  }

  async hibernatePod(podId: string): Promise<void> {
    // TODO: Implement hibernation with snapshots
    console.log(
      `[PodManager] Hibernation not yet implemented for pod: ${podId}`,
    );
    throw new Error("Hibernation not yet implemented");
  }

  async wakePod(podId: string): Promise<void> {
    // TODO: Implement wake from hibernation
    console.log(
      `[PodManager] Wake from hibernation not yet implemented for pod: ${podId}`,
    );
    throw new Error("Wake from hibernation not yet implemented");
  }

  // Event handling
  onPodEvent(handler: PodEventHandler): void {
    this.on("pod-event", handler);
  }

  // Private helper methods
  private async updatePodStatus(
    podId: string,
    status: PodStatus,
    error?: string,
  ): Promise<void> {
    const pod = this.pods.get(podId);
    if (pod) {
      pod.status = status;
      pod.error = error;
      pod.updatedAt = new Date();
      console.log(
        `[PodManager] Pod ${podId} status: ${status}${error ? ` (${error})` : ""}`,
      );
    }
  }

  private emitEvent(
    type: PodEvent["type"],
    podId: string,
    data?: Record<string, unknown>,
  ): void {
    const event: PodEvent = {
      podId,
      type,
      timestamp: new Date(),
      data,
    };
    this.emit("pod-event", event);
  }

  private async allocateExternalPorts(config: PodConfig, networkManager: NetworkManager): Promise<void> {
    // With the Nginx proxy approach, we only need to expose ONE port (80)
    // All internal services are accessed via hostname-based routing

    // Check if we already have a proxy port configured
    const proxyPort = config.network.ports.find(
      (p) => p.name === "nginx-proxy",
    );

    if (!proxyPort) {
      // Add a single proxy port that maps to container port 80 (Nginx)
      const externalPort = await networkManager.allocatePort(
        config.id,
        "nginx-proxy",
      );

      config.network.ports.push({
        name: "nginx-proxy",
        internal: 80,
        external: externalPort,
        protocol: "tcp",
      });

      console.log(
        `[PodManager] Allocated proxy port ${externalPort} for pod ${config.id}`,
      );
    }

    // No need to allocate external ports for individual services anymore
    // They're all accessible through the Nginx proxy via hostname routing
  }

  private async setupGitHubRepository(
    podId: string,
    config: PodConfig,
  ): Promise<void> {
    if (!config.githubRepo || !config.githubRepoSetup) {
      return;
    }

    const setup: GitHubRepoSetup = {
      type: config.githubRepoSetup.type,
      repository: config.githubRepo,
      branch: config.githubBranch,
      sshKeyPair: config.githubRepoSetup.sshKeyPair,
      deployKeyId: config.githubRepoSetup.deployKeyId,
    };

    // Get template if this is a new project
    const template = config.templateId
      ? getTemplateUnsafe(config.templateId)
      : undefined;

    // Setup repository (clone or init from template)
    await this.githubIntegration.setupRepository(podId, setup, template);
  }

  private async provisionServices(config: PodConfig, serviceProvisioner: ServiceProvisioner): Promise<void> {
    // Works for urls like:
    // - git@github.com:owner/repo.git
    // - https://github.com/owner/repo.git
    // - owner/repo
    const projectFolder = config.githubRepo
      ? /.*\/(.*?)(\.git)?$/.exec(config.githubRepo)?.[1]
      : undefined;

    for (const service of config.services) {
      if (service.enabled) {
        await serviceProvisioner.provisionService(
          config.id,
          service,
          projectFolder,
        );
      }
    }
  }

  private async startServices(config: PodConfig, serviceProvisioner: ServiceProvisioner): Promise<void> {
    // Start services in dependency order
    const startedServices = new Set<string>();
    const startService = async (service: ServiceConfig): Promise<void> => {
      if (startedServices.has(service.name) || !service.enabled) {
        return;
      }

      // Start dependencies first
      for (const depName of service.dependsOn || []) {
        const depService = config.services.find((s) => s.name === depName);
        if (depService) {
          await startService(depService);
        }
      }

      await serviceProvisioner.startService(config.id, service.name);
      startedServices.add(service.name);
    };

    for (const service of config.services) {
      await startService(service);
    }
  }

  private async stopServices(config: PodConfig, serviceProvisioner: ServiceProvisioner): Promise<void> {
    // Stop services in reverse dependency order
    const servicesToStop = config.services.filter((s) => s.enabled).reverse();

    for (const service of servicesToStop) {
      try {
        await serviceProvisioner.stopService(config.id, service.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[PodManager] Failed to stop service ${service.name}: ${message}`,
        );
      }
    }
  }

  private async removeServices(config: PodConfig, serviceProvisioner: ServiceProvisioner): Promise<void> {
    for (const service of config.services) {
      try {
        await serviceProvisioner.removeService(config.id, service.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[PodManager] Failed to remove service ${service.name}: ${message}`,
        );
      }
    }
  }

  private async runHooks(podId: string, hooks: string[]): Promise<void> {
    for (const hook of hooks) {
      await this.execInPod(podId, [
        "sh",
        "-c",
        `'${hook.replace(/'/g, "\\'")}'`,
      ]);
    }
  }
}
