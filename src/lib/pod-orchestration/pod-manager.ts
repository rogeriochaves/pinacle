import { EventEmitter } from "node:events";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { pods } from "../db/schema";
import { DefaultConfigResolver } from "./config-resolver";
import { GVisorRuntime } from "./container-runtime";
import { GitHubIntegration, type GitHubRepoSetup } from "./github-integration";
import { NetworkManager } from "./network-manager";
import { type PinacleConfig, podConfigToPinacleConfig } from "./pinacle-config";
import { ServiceProvisioner } from "./service-provisioner";
import { getTemplateUnsafe } from "./template-registry";
import type {
  ConfigResolver,
  ContainerInfo,
  PodEvent,
  PodEventHandler,
  PodInstance,
  PodSpec,
  ServerConnection,
  ServiceConfig,
} from "./types";

export class PodManager extends EventEmitter {
  public podId: string;
  private configResolver: ConfigResolver;
  private githubIntegration: GitHubIntegration;
  private serverConnection: ServerConnection;
  private containerRuntime: GVisorRuntime;
  private networkManager: NetworkManager;
  private serviceProvisioner: ServiceProvisioner;

  constructor(podId: string, serverConnection: ServerConnection) {
    super();

    this.podId = podId;
    this.serverConnection = serverConnection;
    this.configResolver = new DefaultConfigResolver();
    this.githubIntegration = new GitHubIntegration(this);
    this.containerRuntime = new GVisorRuntime(this.serverConnection);
    this.networkManager = new NetworkManager(this.serverConnection);
    this.serviceProvisioner = new ServiceProvisioner(
      this.podId,
      this.serverConnection,
    );
  }

  async createPod(spec: PodSpec): Promise<PodInstance> {
    console.log(`[PodManager] Creating pod: ${spec.name} (${spec.id})`);

    try {
      // Validate configuration
      const validation = await this.configResolver.validateConfig(spec);
      if (!validation.valid) {
        throw new Error(
          `Invalid configuration: ${validation.errors.join(", ")}`,
        );
      }

      // Create pod instance
      const podInstance: PodInstance = {
        id: spec.id,
        spec: spec,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.emitEvent("created");

      // Create network
      console.log(`[PodManager] Creating network for pod ${spec.id}`);
      const podIp = await this.networkManager.createPodNetwork(
        spec.id,
        spec.network,
      );

      // Update config with assigned IP
      spec.network.podIp = podIp;

      // Allocate external ports
      console.log(`[PodManager] Allocating ports for pod ${spec.id}`);
      await this.allocateExternalPorts(spec);

      // Create container
      console.log(`[PodManager] Creating container for pod ${spec.id}`);
      const container = await this.containerRuntime.createContainer(spec);

      // Update pod instance
      podInstance.container = container;
      podInstance.status = "starting";
      podInstance.updatedAt = new Date();

      // Start container
      console.log(`[PodManager] Starting container for pod ${spec.id}`);
      await this.containerRuntime.startContainer(container.id);

      // Set up port forwarding
      console.log(`[PodManager] Setting up port forwarding for pod ${spec.id}`);
      for (const port of spec.network.ports) {
        if (port.external) {
          await this.networkManager.setupPortForwarding(spec.id, port);
        }
      }

      // Setup GitHub repository if configured
      if (spec.githubRepo && spec.githubRepoSetup) {
        console.log(
          `[PodManager] Setting up GitHub repository for pod ${spec.id}`,
        );
        await this.setupGitHubRepository(spec);
        const pinacleConfig = podConfigToPinacleConfig(spec);
        await this.injectPinacleConfig(pinacleConfig, spec.githubRepo);
      }

      // Provision services
      console.log(`[PodManager] Provisioning services for pod ${spec.id}`);
      await this.provisionServices(spec, this.serviceProvisioner);

      // Start services
      console.log(`[PodManager] Starting services for pod ${spec.id}`);
      await this.startServices(spec, this.serviceProvisioner);

      // Update status to running
      this.emitEvent("started");

      console.log(
        `[PodManager] Successfully created pod: ${spec.name} (${spec.id})`,
      );
      return podInstance;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PodManager] Pod creation failed: ${message}`);
      throw error;
    }
  }

  async startPod(): Promise<void> {
    const podId = this.podId;
    const container = await this.getPodContainer();
    if (!container) {
      throw new Error(`Pod ${podId} has no container`);
    }

    if (container.status === "running") {
      console.log(`[PodManager] Pod ${podId} is already running`);
      return;
    }

    console.log(`[PodManager] Starting pod: ${podId}`);

    try {
      // Start container
      await this.containerRuntime.startContainer(container.id);

      this.emitEvent("started");

      console.log(`[PodManager] Successfully started pod: ${podId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PodManager] Failed to start pod ${podId}: ${message}`);
      this.emitEvent("failed", { error: message });
      throw error;
    }
  }

  async stopPod(): Promise<void> {
    const container = await this.getPodContainer();
    if (!container) {
      throw new Error(`Pod ${this.podId} has no container`);
    }

    if (container.status === "stopped") {
      console.log(`[PodManager] Pod ${this.podId} is already stopped`);
      return;
    }

    console.log(`[PodManager] Stopping pod: ${this.podId}`);

    try {
      // Stop services
      await this.serviceProvisioner.stopService(this.podId, container.id);

      // Stop container
      await this.containerRuntime.stopContainer(container.id);

      this.emitEvent("stopped");

      console.log(`[PodManager] Successfully stopped pod: ${this.podId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[PodManager] Failed to stop pod ${this.podId}: ${message}`,
      );
      this.emitEvent("failed", { error: message });
      throw error;
    }
  }

  /**
   * Clean up pod without a container ID, try to find it on the machine
   */
  async cleanupPod(): Promise<void> {
    const container = await this.containerRuntime.getContainerForPod(
      this.podId,
    );

    if (!container) {
      console.log(
        `[PodManager] Container not found: ${this.podId}, nothing to cleanup`,
      );

      await this.networkManager.destroyPodNetwork(this.podId);

      return;
    }

    await this.cleanupPodByContainerId(container.id);
  }

  /**
   * Clean up pod resources using container ID from database
   * This doesn't require the pod to be loaded in memory - works with just the container ID
   */
  async cleanupPodByContainerId(containerId: string): Promise<void> {
    console.log(
      `[PodManager] Cleaning up resources for pod ${this.podId}, container ${containerId}`,
    );

    try {
      // Stop the container if it's running
      try {
        const container = await this.containerRuntime.getContainer(containerId);
        if (container && container.status === "running") {
          console.log(`[PodManager] Stopping container ${containerId}`);
          await this.containerRuntime.stopContainer(containerId);
        }
      } catch (error) {
        console.log(`[PodManager] Container may already be stopped: ${error}`);
        // Continue - container might already be stopped
      }

      // Remove the container
      console.log(`[PodManager] Removing container ${containerId}`);
      await this.containerRuntime.removeContainer(containerId);

      // Destroy the network (uses deterministic network name from pod ID)
      console.log(`[PodManager] Destroying network for pod ${this.podId}`);
      await this.networkManager.destroyPodNetwork(this.podId);

      console.log(
        `[PodManager] Successfully cleaned up resources for pod: ${this.podId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[PodManager] Failed to cleanup resources for pod ${this.podId}: ${message}`,
      );
      throw error;
    }
  }

  async deletePod(): Promise<void> {
    const container = await this.getPodContainer();
    if (!container) {
      throw new Error(`Pod ${this.podId} has no container`);
    }

    console.log(`[PodManager] Deleting pod container: ${container.id}`);

    try {
      await this.containerRuntime.removeContainer(container.id);

      // Stop pod if running
      if (container.status === "running") {
        await this.stopPod();
      }

      // Remove container
      await this.containerRuntime.removeContainer(container.id);

      // Destroy network
      await this.networkManager.destroyPodNetwork(this.podId);

      // Release allocated ports
      for (const port of container.ports) {
        if (port.external) {
          await this.networkManager.releasePort(this.podId, port.external);
        }
      }

      // Remove pod from memory
      this.emitEvent("deleted");

      console.log(`[PodManager] Successfully deleted pod: ${this.podId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[PodManager] Failed to delete pod ${this.podId}: ${message}`,
      );
      this.emitEvent("failed", { error: message });
      throw error;
    }
  }

  async getPodContainer(): Promise<ContainerInfo | null> {
    return await this.containerRuntime.getContainerForPod(this.podId);
  }

  async execInPod(command: string[]): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    const container = await this.getPodContainer();
    if (!container) {
      throw new Error(`Pod not found or not running: ${this.podId}`);
    }

    return this.containerRuntime.execInContainer(
      this.podId,
      container.id,
      command,
    );
  }

  async getPodLogs(
    options: { tail?: number; follow?: boolean } = {},
  ): Promise<string> {
    const container = await this.getPodContainer();
    if (!container) {
      throw new Error(`Pod not found or not running: ${this.podId}`);
    }

    return this.containerRuntime.getContainerLogs(container.id, options);
  }

  async checkPodHealth(): Promise<boolean> {
    const container = await this.getPodContainer();
    if (!container || container.status !== "running") {
      return false;
    }

    const [dbPod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, this.podId))
      .limit(1);
    if (!dbPod) {
      throw new Error(`Pod not found on db: ${this.podId}`);
    }
    const config = JSON.parse(dbPod.config) as PinacleConfig;

    try {
      // Check service health
      for (const service of config.services) {
        const isHealthy = await this.serviceProvisioner.checkServiceHealth(
          this.podId,
          service,
        );
        if (!isHealthy) {
          return false;
        }
      }

      this.emitEvent("health_check", { healthy: true });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[PodManager] Health check failed for pod ${this.podId}: ${message}`,
      );
      this.emitEvent("health_check", {
        healthy: false,
        error: message,
      });
      return false;
    }
  }

  async hibernatePod(): Promise<void> {
    // TODO: Implement hibernation with snapshots
    console.log(
      `[PodManager] Hibernation not yet implemented for pod: ${this.podId}`,
    );
    throw new Error("Hibernation not yet implemented");
  }

  async wakePod(): Promise<void> {
    // TODO: Implement wake from hibernation
    console.log(
      `[PodManager] Wake from hibernation not yet implemented for pod: ${this.podId}`,
    );
    throw new Error("Wake from hibernation not yet implemented");
  }

  // Event handling
  onPodEvent(handler: PodEventHandler): void {
    this.on("pod-event", handler);
  }

  private emitEvent(
    type: PodEvent["type"],
    data?: Record<string, unknown>,
  ): void {
    const event: PodEvent = {
      podId: this.podId,
      type,
      timestamp: new Date(),
      data,
    };
    this.emit("pod-event", event);
  }

  private async allocateExternalPorts(spec: PodSpec): Promise<void> {
    // With the Nginx proxy approach, we only need to expose ONE port (80)
    // All internal services are accessed via hostname-based routing

    // Check if we already have a proxy port configured
    const proxyPort = spec.network.ports.find((p) => p.name === "nginx-proxy");

    if (!proxyPort) {
      // Add a single proxy port that maps to container port 80 (Nginx)
      const externalPort = await this.networkManager.allocatePort(
        spec.id,
        "nginx-proxy",
      );

      spec.network.ports.push({
        name: "nginx-proxy",
        internal: 80,
        external: externalPort,
        protocol: "tcp",
      });

      console.log(
        `[PodManager] Allocated proxy port ${externalPort} for pod ${spec.id}`,
      );
    }

    // No need to allocate external ports for individual services anymore
    // They're all accessible through the Nginx proxy via hostname routing
  }

  private async setupGitHubRepository(spec: PodSpec): Promise<void> {
    if (!spec.githubRepo || !spec.githubRepoSetup) {
      return;
    }

    const setup: GitHubRepoSetup = {
      type: spec.githubRepoSetup.type,
      repository: spec.githubRepo,
      branch: spec.githubBranch,
      sshKeyPair: spec.githubRepoSetup.sshKeyPair,
      deployKeyId: spec.githubRepoSetup.deployKeyId,
    };

    // Get template if this is a new project
    const template = spec.templateId
      ? getTemplateUnsafe(spec.templateId)
      : undefined;

    // Setup repository (clone or init from template)
    await this.githubIntegration.setupRepository(spec.id, setup, template);
  }

  private async provisionServices(
    spec: PodSpec,
    serviceProvisioner: ServiceProvisioner,
  ): Promise<void> {
    for (const service of spec.services) {
      if (service.enabled) {
        await serviceProvisioner.provisionService(spec, service);
      }
    }
  }

  private async startServices(
    spec: PodSpec,
    serviceProvisioner: ServiceProvisioner,
  ): Promise<void> {
    // Start services in dependency order
    const startedServices = new Set<string>();
    const startService = async (service: ServiceConfig): Promise<void> => {
      if (startedServices.has(service.name) || !service.enabled) {
        return;
      }

      // Start dependencies first
      for (const depName of service.dependsOn || []) {
        const depService = spec.services.find((s) => s.name === depName);
        if (depService) {
          await startService(depService);
        }
      }

      await serviceProvisioner.startService({
        spec,
        podId: spec.id,
        serviceName: service.name,
      });
      startedServices.add(service.name);
    };

    for (const service of spec.services) {
      await startService(service);
    }
  }

  /**
   * Inject pinacle.yaml configuration file into the pod's workspace
   */
  async injectPinacleConfig(
    config: PinacleConfig,
    repository: string,
  ): Promise<void> {
    return this.githubIntegration.injectPinacleConfig(config, repository);
  }
}
