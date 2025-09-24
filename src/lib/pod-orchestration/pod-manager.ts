import { EventEmitter } from "events";
import { DefaultConfigResolver } from "./config-resolver";

import { LimaGVisorRuntime } from "./container-runtime";
import { LimaNetworkManager } from "./network-manager";
import { LimaServiceProvisioner } from "./service-provisioner";
import type {
  ConfigResolver,
  ContainerInfo,
  ContainerRuntime,
  LimaConfig,
  NetworkManager,
  PodConfig,
  PodEvent,
  PodEventHandler,
  PodInstance,
  PodManager,
  PodStatus,
  ServiceProvisioner,
} from "./types";

export class DefaultPodManager extends EventEmitter implements PodManager {
  private pods: Map<string, PodInstance> = new Map();
  private containerRuntime: ContainerRuntime;
  private networkManager: NetworkManager;
  private serviceProvisioner: ServiceProvisioner;
  private configResolver: ConfigResolver;

  constructor(limaConfig?: LimaConfig) {
    super();

    this.containerRuntime = new LimaGVisorRuntime(limaConfig);
    this.networkManager = new LimaNetworkManager(limaConfig);
    this.serviceProvisioner = new LimaServiceProvisioner(limaConfig);
    this.configResolver = new DefaultConfigResolver();
  }

  async createPod(config: PodConfig): Promise<PodInstance> {
    console.log(`[PodManager] Creating pod: ${config.name} (${config.id})`);

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

    try {
      // Update status to provisioning
      await this.updatePodStatus(config.id, "provisioning");

      // Create network
      console.log(`[PodManager] Creating network for pod ${config.id}`);
      const podIp = await this.networkManager.createPodNetwork(
        config.id,
        config.network,
      );

      // Update config with assigned IP
      config.network.podIp = podIp;

      // Allocate external ports
      console.log(`[PodManager] Allocating ports for pod ${config.id}`);
      await this.allocateExternalPorts(config);

      // Create container
      console.log(`[PodManager] Creating container for pod ${config.id}`);
      const container = await this.containerRuntime.createContainer(config);

      // Update pod instance
      podInstance.container = container;
      podInstance.status = "starting";
      podInstance.updatedAt = new Date();

      // Start container
      console.log(`[PodManager] Starting container for pod ${config.id}`);
      await this.containerRuntime.startContainer(container.id);

      // Set up port forwarding
      console.log(
        `[PodManager] Setting up port forwarding for pod ${config.id}`,
      );
      for (const port of config.network.ports) {
        if (port.external) {
          await this.networkManager.setupPortForwarding(config.id, port);
        }
      }

      // Provision services
      console.log(`[PodManager] Provisioning services for pod ${config.id}`);
      await this.provisionServices(config);

      // Start services
      console.log(`[PodManager] Starting services for pod ${config.id}`);
      await this.startServices(config);

      // Run post-start hooks
      if (config.hooks?.postStart) {
        console.log(
          `[PodManager] Running post-start hooks for pod ${config.id}`,
        );
        await this.runHooks(config.id, config.hooks.postStart);
      }

      // Update status to running
      await this.updatePodStatus(config.id, "running");
      this.emitEvent("started", config.id);

      console.log(
        `[PodManager] Successfully created pod: ${config.name} (${config.id})`,
      );
      return podInstance;
    } catch (error: any) {
      console.error(
        `[PodManager] Failed to create pod ${config.id}: ${error.message}`,
      );

      // Cleanup on failure
      try {
        await this.cleanupFailedPod(config.id);
      } catch (cleanupError: any) {
        console.error(`[PodManager] Cleanup failed: ${cleanupError.message}`);
      }

      await this.updatePodStatus(config.id, "failed", error.message);
      this.emitEvent("failed", config.id, { error: error.message });

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

    try {
      await this.updatePodStatus(podId, "starting");

      // Start container
      await this.containerRuntime.startContainer(pod.container.id);

      // Start services
      await this.startServices(pod.config);

      // Run post-start hooks
      if (pod.config.hooks?.postStart) {
        await this.runHooks(podId, pod.config.hooks.postStart);
      }

      await this.updatePodStatus(podId, "running");
      this.emitEvent("started", podId);

      console.log(`[PodManager] Successfully started pod: ${podId}`);
    } catch (error: any) {
      console.error(
        `[PodManager] Failed to start pod ${podId}: ${error.message}`,
      );
      await this.updatePodStatus(podId, "failed", error.message);
      this.emitEvent("failed", podId, { error: error.message });
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

    try {
      await this.updatePodStatus(podId, "stopping");

      // Run pre-stop hooks
      if (pod.config.hooks?.preStop) {
        await this.runHooks(podId, pod.config.hooks.preStop);
      }

      // Stop services
      await this.stopServices(pod.config);

      // Stop container
      await this.containerRuntime.stopContainer(pod.container.id);

      await this.updatePodStatus(podId, "stopped");
      this.emitEvent("stopped", podId);

      console.log(`[PodManager] Successfully stopped pod: ${podId}`);
    } catch (error: any) {
      console.error(
        `[PodManager] Failed to stop pod ${podId}: ${error.message}`,
      );
      await this.updatePodStatus(podId, "failed", error.message);
      this.emitEvent("failed", podId, { error: error.message });
      throw error;
    }
  }

  async deletePod(podId: string): Promise<void> {
    const pod = this.pods.get(podId);
    if (!pod) {
      throw new Error(`Pod not found: ${podId}`);
    }

    console.log(`[PodManager] Deleting pod: ${podId}`);

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
      await this.removeServices(pod.config);

      // Remove container
      if (pod.container) {
        await this.containerRuntime.removeContainer(pod.container.id);
      }

      // Remove port forwarding
      for (const port of pod.config.network.ports) {
        if (port.external) {
          await this.networkManager.removePortForwarding(podId, port);
        }
      }

      // Destroy network
      await this.networkManager.destroyPodNetwork(podId);

      // Release allocated ports
      for (const port of pod.config.network.ports) {
        if (port.external) {
          await this.networkManager.releasePort(podId, port.external);
        }
      }

      // Remove pod from memory
      this.pods.delete(podId);
      this.emitEvent("deleted", podId);

      console.log(`[PodManager] Successfully deleted pod: ${podId}`);
    } catch (error: any) {
      console.error(
        `[PodManager] Failed to delete pod ${podId}: ${error.message}`,
      );
      await this.updatePodStatus(podId, "failed", error.message);
      this.emitEvent("failed", podId, { error: error.message });
      throw error;
    }
  }

  async getPod(podId: string): Promise<PodInstance | null> {
    return this.pods.get(podId) || null;
  }

  async listPods(filters: Record<string, any> = {}): Promise<PodInstance[]> {
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

    return this.containerRuntime.execCommand(pod.container.id, command);
  }

  async getPodLogs(
    podId: string,
    options: { tail?: number; follow?: boolean } = {},
  ): Promise<string> {
    const pod = this.pods.get(podId);
    if (!pod || !pod.container) {
      throw new Error(`Pod not found or not running: ${podId}`);
    }

    return this.containerRuntime.getContainerLogs(pod.container.id, options);
  }

  async checkPodHealth(podId: string): Promise<boolean> {
    const pod = this.pods.get(podId);
    if (!pod || !pod.container) {
      return false;
    }

    try {
      // Check container status
      const container = await this.containerRuntime.getContainer(
        pod.container.id,
      );
      if (!container || container.status !== "running") {
        return false;
      }

      // Check service health
      for (const service of pod.config.services) {
        if (service.enabled) {
          const isHealthy = await this.serviceProvisioner.checkServiceHealth(
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
    } catch (error: any) {
      console.error(
        `[PodManager] Health check failed for pod ${podId}: ${error.message}`,
      );
      this.emitEvent("health_check", podId, {
        healthy: false,
        error: error.message,
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

  private emitEvent(type: PodEvent["type"], podId: string, data?: any): void {
    const event: PodEvent = {
      podId,
      type,
      timestamp: new Date(),
      data,
    };
    this.emit("pod-event", event);
  }

  private async allocateExternalPorts(config: PodConfig): Promise<void> {
    for (const port of config.network.ports) {
      if (!port.external) {
        const externalPort = await this.networkManager.allocatePort(
          config.id,
          port.name,
        );
        port.external = externalPort;
      }
    }

    // Also allocate ports for services
    for (const service of config.services) {
      for (const port of service.ports || []) {
        if (!port.external) {
          const externalPort = await this.networkManager.allocatePort(
            config.id,
            `${service.name}-${port.name}`,
          );
          port.external = externalPort;
        }
      }
    }
  }

  private async provisionServices(config: PodConfig): Promise<void> {
    for (const service of config.services) {
      if (service.enabled) {
        await this.serviceProvisioner.provisionService(config.id, service);
      }
    }
  }

  private async startServices(config: PodConfig): Promise<void> {
    // Start services in dependency order
    const startedServices = new Set<string>();
    const startService = async (service: any): Promise<void> => {
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

      await this.serviceProvisioner.startService(config.id, service.name);
      startedServices.add(service.name);
    };

    for (const service of config.services) {
      await startService(service);
    }
  }

  private async stopServices(config: PodConfig): Promise<void> {
    // Stop services in reverse dependency order
    const servicesToStop = config.services.filter((s) => s.enabled).reverse();

    for (const service of servicesToStop) {
      try {
        await this.serviceProvisioner.stopService(config.id, service.name);
      } catch (error: any) {
        console.warn(
          `[PodManager] Failed to stop service ${service.name}: ${error.message}`,
        );
      }
    }
  }

  private async removeServices(config: PodConfig): Promise<void> {
    for (const service of config.services) {
      try {
        await this.serviceProvisioner.removeService(config.id, service.name);
      } catch (error: any) {
        console.warn(
          `[PodManager] Failed to remove service ${service.name}: ${error.message}`,
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

  private async cleanupFailedPod(podId: string): Promise<void> {
    console.log(`[PodManager] Cleaning up failed pod: ${podId}`);

    try {
      // Try to remove container if it exists
      const pod = this.pods.get(podId);
      if (pod?.container) {
        await this.containerRuntime.removeContainer(pod.container.id);
      }

      // Try to destroy network
      await this.networkManager.destroyPodNetwork(podId);

      // Release allocated ports
      if (pod) {
        for (const port of pod.config.network.ports) {
          if (port.external) {
            await this.networkManager.releasePort(podId, port.external);
          }
        }
      }
    } catch (error: any) {
      console.error(`[PodManager] Cleanup error: ${error.message}`);
    }
  }
}
