import { EventEmitter } from "node:events";
import { DefaultConfigResolver } from "./config-resolver";

import { LimaGVisorRuntime } from "./container-runtime";
import { GitHubIntegration, type GitHubRepoSetup } from "./github-integration";
import { LimaNetworkManager } from "./network-manager";
import { type PinacleConfig, podConfigToPinacleConfig } from "./pinacle-config";
import { LimaServiceProvisioner } from "./service-provisioner";
import { getTemplateUnsafe } from "./template-registry";
import type {
  ConfigResolver,
  ContainerRuntime,
  LimaConfig,
  NetworkManager,
  PodEvent,
  PodEventHandler,
  PodInstance,
  PodManager,
  PodSpec,
  PodStatus,
  ServiceConfig,
  ServiceProvisioner,
} from "./types";

export class DefaultPodManager extends EventEmitter implements PodManager {
  private pods: Map<string, PodInstance> = new Map();
  // Store per-pod components for operations after creation
  private podComponents: Map<
    string,
    {
      containerRuntime: ContainerRuntime;
      networkManager: NetworkManager;
      serviceProvisioner: ServiceProvisioner;
    }
  > = new Map();
  private limaConfig: LimaConfig;
  private configResolver: ConfigResolver;
  private githubIntegration: GitHubIntegration;

  constructor(limaConfig: LimaConfig) {
    super();

    this.limaConfig = limaConfig;
    this.configResolver = new DefaultConfigResolver();
    this.githubIntegration = new GitHubIntegration(this);
  }

  // Helper method to create pod-specific orchestration components
  private createPodComponents(podId: string) {
    const components = {
      containerRuntime: new LimaGVisorRuntime(
        this.limaConfig,
        undefined,
        podId,
      ),
      networkManager: new LimaNetworkManager(this.limaConfig, undefined, podId),
      serviceProvisioner: new LimaServiceProvisioner(
        this.limaConfig,
        undefined,
        podId,
      ),
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

  async createPod(spec: PodSpec): Promise<PodInstance> {
    console.log(`[PodManager] Creating pod: ${spec.name} (${spec.id})`);

    // Create pod-specific runtime, network manager, and service provisioner
    // They will log all commands with the pod ID
    const { containerRuntime, networkManager, serviceProvisioner } =
      this.createPodComponents(spec.id);

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

      this.pods.set(spec.id, podInstance);
      this.emitEvent("created", spec.id);
      // Update status to provisioning
      await this.updatePodStatus(spec.id, "provisioning");

      // Create network
      console.log(`[PodManager] Creating network for pod ${spec.id}`);
      const podIp = await networkManager.createPodNetwork(
        spec.id,
        spec.network,
      );

      // Update config with assigned IP
      spec.network.podIp = podIp;

      // Allocate external ports
      console.log(`[PodManager] Allocating ports for pod ${spec.id}`);
      await this.allocateExternalPorts(spec, networkManager);

      // Create container
      console.log(`[PodManager] Creating container for pod ${spec.id}`);
      const container = await containerRuntime.createContainer(spec);

      // Update pod instance
      podInstance.container = container;
      podInstance.status = "starting";
      podInstance.updatedAt = new Date();

      // Start container
      console.log(`[PodManager] Starting container for pod ${spec.id}`);
      await containerRuntime.startContainer(container.id);

      // Set up port forwarding
      console.log(`[PodManager] Setting up port forwarding for pod ${spec.id}`);
      for (const port of spec.network.ports) {
        if (port.external) {
          await networkManager.setupPortForwarding(spec.id, port);
        }
      }

      // Setup GitHub repository if configured
      if (spec.githubRepo && spec.githubRepoSetup) {
        console.log(
          `[PodManager] Setting up GitHub repository for pod ${spec.id}`,
        );
        await this.setupGitHubRepository(spec.id, spec);
        const pinacleConfig = podConfigToPinacleConfig(spec);
        await this.injectPinacleConfig(spec.id, pinacleConfig, spec.githubRepo);
      }

      // Provision services
      console.log(`[PodManager] Provisioning services for pod ${spec.id}`);
      await this.provisionServices(spec, serviceProvisioner);

      // Start services
      console.log(`[PodManager] Starting services for pod ${spec.id}`);
      await this.startServices(spec, serviceProvisioner);

      // Run post-start hooks
      if (spec.hooks?.postStart) {
        console.log(`[PodManager] Running post-start hooks for pod ${spec.id}`);
        await this.runHooks(spec.id, spec.hooks.postStart);
      }

      // Update status to running
      await this.updatePodStatus(spec.id, "running");
      this.emitEvent("started", spec.id);

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
      await this.startServices(pod.spec, serviceProvisioner);

      // Run post-start hooks
      if (pod.spec.hooks?.postStart) {
        await this.runHooks(podId, pod.spec.hooks.postStart);
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
      if (pod.spec.hooks?.preStop) {
        await this.runHooks(podId, pod.spec.hooks.preStop);
      }

      // Stop services
      await this.stopServices(pod.spec, serviceProvisioner);

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

    const { containerRuntime, networkManager, serviceProvisioner } =
      this.getComponents(podId);

    try {
      await this.updatePodStatus(podId, "terminating");

      // Stop pod if running
      if (pod.status === "running") {
        await this.stopPod(podId);
      }

      // Run pre-stop hooks
      if (pod.spec.hooks?.preStop) {
        await this.runHooks(podId, pod.spec.hooks.preStop);
      }

      // Remove services
      await this.removeServices(pod.spec, serviceProvisioner);

      // Remove container
      if (pod.container) {
        await containerRuntime.removeContainer(pod.container.id);
      }

      // Remove port forwarding
      for (const port of pod.spec.network.ports) {
        if (port.external) {
          await networkManager.removePortForwarding(podId, port);
        }
      }

      // Destroy network
      await networkManager.destroyPodNetwork(podId);

      // Release allocated ports
      for (const port of pod.spec.network.ports) {
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
      pods = pods.filter((pod) => pod.spec.templateId === filters.templateId);
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
      const container = await containerRuntime.getContainer(pod.container.id);
      if (!container || container.status !== "running") {
        return false;
      }

      // Check service health
      for (const service of pod.spec.services) {
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
        limit: pod.spec.resources.cpuCores * 100,
      },
      memory: {
        usage: Math.random() * pod.spec.resources.memoryMb, // Mock memory usage in MB
        limit: pod.spec.resources.memoryMb,
      },
      network: {
        rx: Math.random() * 1000, // Mock network RX in KB/s
        tx: Math.random() * 1000, // Mock network TX in KB/s
      },
      disk: {
        usage: Math.random() * pod.spec.resources.storageMb, // Mock disk usage in MB
        limit: pod.spec.resources.storageMb,
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

  private async allocateExternalPorts(
    spec: PodSpec,
    networkManager: NetworkManager,
  ): Promise<void> {
    // With the Nginx proxy approach, we only need to expose ONE port (80)
    // All internal services are accessed via hostname-based routing

    // Check if we already have a proxy port configured
    const proxyPort = spec.network.ports.find((p) => p.name === "nginx-proxy");

    if (!proxyPort) {
      // Add a single proxy port that maps to container port 80 (Nginx)
      const externalPort = await networkManager.allocatePort(
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

  private async setupGitHubRepository(
    podId: string,
    spec: PodSpec,
  ): Promise<void> {
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
    await this.githubIntegration.setupRepository(podId, setup, template);
  }

  private async provisionServices(
    spec: PodSpec,
    serviceProvisioner: ServiceProvisioner,
  ): Promise<void> {
    const projectFolder = this.githubIntegration.getProjectFolder(
      spec.githubRepo,
    );

    for (const service of spec.services) {
      if (service.enabled) {
        await serviceProvisioner.provisionService(
          spec.id,
          service,
          projectFolder,
        );
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

      await serviceProvisioner.startService(spec.id, service.name);
      startedServices.add(service.name);
    };

    for (const service of spec.services) {
      await startService(service);
    }
  }

  private async stopServices(
    spec: PodSpec,
    serviceProvisioner: ServiceProvisioner,
  ): Promise<void> {
    // Stop services in reverse dependency order
    const servicesToStop = spec.services.filter((s) => s.enabled).reverse();

    for (const service of servicesToStop) {
      try {
        await serviceProvisioner.stopService(spec.id, service.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[PodManager] Failed to stop service ${service.name}: ${message}`,
        );
      }
    }
  }

  private async removeServices(
    spec: PodSpec,
    serviceProvisioner: ServiceProvisioner,
  ): Promise<void> {
    for (const service of spec.services) {
      try {
        await serviceProvisioner.removeService(spec.id, service.name);
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

  /**
   * Inject pinacle.yaml configuration file into the pod's workspace
   */
  async injectPinacleConfig(
    podId: string,
    config: PinacleConfig,
    repository: string,
  ): Promise<void> {
    return this.githubIntegration.injectPinacleConfig(
      podId,
      config,
      repository,
    );
  }
}
