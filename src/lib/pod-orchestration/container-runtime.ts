import { RESOURCE_TIERS } from "./resource-tier-registry";
import type {
  ContainerCommand,
  ContainerInfo,
  PodSpec,
  PortMapping,
  ServerConnection,
} from "./types";

export class GVisorRuntime {
  private serverConnection: ServerConnection;

  constructor(serverConnection: ServerConnection) {
    // Use provided connection or create default Lima connection for dev
    this.serverConnection = serverConnection;
  }

  private async exec(
    command: string,
    useSudo: boolean = false,
    containerCommand?: ContainerCommand,
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await this.serverConnection.exec(command, {
        sudo: useSudo,
        containerCommand,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ContainerRuntime] Command failed: ${message}`);
      throw error;
    }
  }

  private generateContainerName(podId: string): string {
    return `pinacle-pod-${podId}`;
  }

  private generateVolumeName(podId: string, volumeName: string): string {
    return `pinacle-vol-${podId}-${volumeName}`;
  }

  private parseResourceLimits(spec: PodSpec): string {
    const tierConfig = RESOURCE_TIERS[spec.tier];
    const limits: string[] = [];

    // Memory limit (memory is in GB, convert to MB)
    limits.push(`--memory=${tierConfig.memory * 1024}m`);

    // CPU limits - Convert CPU cores to quota (1 core = 100000 microseconds per 100ms period)
    const cpuQuota = Math.floor(tierConfig.cpu * 100000);
    limits.push(`--cpu-quota=${cpuQuota}`);
    limits.push(`--cpu-period=100000`);

    // Storage limit - skip for now as not supported in Lima environment
    // TODO: Implement storage limits using other methods in production
    // if (resources.storageMb) {
    //   limits.push(`--storage-opt size=${resources.storageMb}m`);
    // }

    return limits.join(" ");
  }

  private parsePortMappings(ports: PortMapping[]): string {
    return ports
      .filter((p) => p.external) // Only map ports that have external assignments
      .map((p) => `-p ${p.external}:${p.internal}/${p.protocol}`)
      .join(" ");
  }

  private parseEnvironmentVars(env: Record<string, string>): string {
    return Object.entries(env)
      .map(([key, value]) => `-e "${key}=${value}"`)
      .join(" ");
  }

  /**
   * Get universal volumes that should be persisted for all pods
   * This covers the entire filesystem except virtual/temporary directories
   */
  private getUniversalVolumes(): Array<{ name: string; path: string }> {
    return [
      // User data and code
      { name: "workspace", path: "/workspace" },
      { name: "home", path: "/home" },
      { name: "root", path: "/root" },

      // System configuration and packages
      { name: "etc", path: "/etc" },
      { name: "usr-local", path: "/usr/local" },
      { name: "opt", path: "/opt" },

      // Variable data (logs, databases, caches, etc.)
      { name: "var", path: "/var" },

      // Additional application data
      { name: "srv", path: "/srv" },
    ];

    // NOT persisted (virtual or temporary):
    // - /tmp (temporary files)
    // - /proc (process information, virtual)
    // - /sys (system information, virtual)
    // - /dev (devices, virtual)
    // - /run (runtime data)
  }

  private parseVolumeMounts(podId: string): string {
    const volumes = this.getUniversalVolumes();
    return volumes
      .map((v) => {
        const volumeName = this.generateVolumeName(podId, v.name);
        return `-v ${volumeName}:${v.path}`;
      })
      .join(" ");
  }

  async createContainer(spec: PodSpec): Promise<ContainerInfo> {
    const containerName = this.generateContainerName(spec.id);
    const resourceLimits = this.parseResourceLimits(spec);
    const portMappings = this.parsePortMappings(spec.network.ports);
    const envVars = this.parseEnvironmentVars(spec.environment);

    // If container already exists, remove it
    const { stdout } = await this.exec(
      `docker ps -a --filter "name=${containerName}" --format='{{.ID}}'`,
      true,
    );
    const containerId = stdout.trim();
    if (containerId) {
      console.log(
        `[GVisorRuntime] Container ${containerName} already exists, removing it`,
      );
      await this.exec(`docker stop ${containerId}`, true);
      await this.exec(`docker rm ${containerId}`, true);
    }

    // Create Docker volumes for persistent storage (universal for all pods)
    const volumes = this.getUniversalVolumes();
    for (const volume of volumes) {
      await this.createVolume(spec.id, volume.name);
    }

    // Parse volume mounts
    const volumeMounts = this.parseVolumeMounts(spec.id);

    // Build Docker run command with gVisor runtime - use array to avoid shell escaping issues
    const dockerArgs = [
      "docker",
      "create",
      "--runtime=runsc", // Use gVisor runtime
      "--name",
      containerName,
      ...resourceLimits.split(" ").filter(Boolean),
      ...portMappings.split(" ").filter(Boolean),
      ...envVars.split(" ").filter(Boolean),
      ...volumeMounts.split(" ").filter(Boolean),
      "--workdir",
      spec.workingDir || "/workspace",
      "--user",
      spec.user || "root",
      // Security options for gVisor
      "--security-opt",
      "seccomp=unconfined",
      "--cap-drop=ALL",
      "--cap-add=NET_BIND_SERVICE",
      // Network configuration
      "--network",
      "bridge", // Will create custom network later
      spec.baseImage,
      // Default command
      "/sbin/init",
    ].filter(Boolean);

    const dockerCommand = dockerArgs.join(" ");

    try {
      const { stdout } = await this.exec(dockerCommand, true);
      const containerId = stdout.trim();

      // Get container info
      const containerInfo = await this.getContainer(containerId);
      if (!containerInfo) {
        throw new Error("Failed to retrieve created container info");
      }

      console.log(
        `[GVisorRuntime] Created container ${containerName} with ID: ${containerId}`,
      );
      return containerInfo;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[GVisorRuntime] Failed to create container: ${message}`);
      throw new Error(`Container creation failed: ${message}`);
    }
  }

  async startContainer(containerId: string): Promise<void> {
    try {
      await this.exec(`docker start ${containerId}`, true);

      // Wait a moment for container to fully initialize
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify container is actually running
      const container = await this.getContainer(containerId);
      if (!container || container.status !== "running") {
        throw new Error(
          `Container failed to start properly: ${container?.status || "unknown"}`,
        );
      }

      console.log(`[GVisorRuntime] Started container: ${containerId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[GVisorRuntime] Failed to start container: ${message}`);
      throw new Error(`Container start failed: ${message}`);
    }
  }

  async stopContainer(containerId: string): Promise<void> {
    try {
      await this.exec(`docker stop ${containerId}`, true);
      console.log(`[GVisorRuntime] Stopped container: ${containerId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[GVisorRuntime] Failed to stop container: ${message}`);
      throw new Error(`Container stop failed: ${message}`);
    }
  }

  async removeContainer(
    containerId: string,
    options?: { removeVolumes?: boolean },
  ): Promise<void> {
    // Default to removing volumes (full cleanup) unless explicitly set to false
    const removeVolumes = options?.removeVolumes ?? true;

    // Get container info to extract pod ID for volume cleanup
    const container = await this.getContainer(containerId);
    const podId = container?.podId;

    // If container doesn't exist, that's fine - it's already gone
    if (!container) {
      console.log(
        `[GVisorRuntime] Container ${containerId} doesn't exist, skipping removal`,
      );
      // Still try to clean up volumes if requested and we can extract pod ID from container name
      if (removeVolumes) {
        // Try to extract pod ID from container ID format: pinacle-pod-{podId}
        const podIdFromName = containerId.replace("pinacle-pod-", "");
        if (podIdFromName !== containerId) {
          console.log(
            `[GVisorRuntime] Cleaning up volumes for pod ${podIdFromName}`,
          );
          await this.removeAllPodVolumes(podIdFromName);
        }
      }
      return;
    }

    // Stop container first if running
    try {
      await this.stopContainer(containerId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Ignore if container doesn't exist or is already stopped
      if (
        !message.includes("No such container") &&
        !message.includes("is not running")
      ) {
        console.warn(`[GVisorRuntime] Error stopping container: ${message}`);
      }
    }

    // Remove the container
    try {
      await this.exec(`docker rm ${containerId}`, true);
      console.log(`[GVisorRuntime] Removed container: ${containerId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // If container doesn't exist, that's fine
      if (message.includes("No such container")) {
        console.log(`[GVisorRuntime] Container ${containerId} already removed`);
      } else {
        const errorMsg = `Failed to remove container: ${message}`;
        console.error(`[GVisorRuntime] ${errorMsg}`);
        throw new Error(errorMsg);
      }
    }

    // Remove volumes (default behavior, unless explicitly disabled)
    if (removeVolumes && podId) {
      console.log(`[GVisorRuntime] Cleaning up volumes for pod ${podId}`);
      await this.removeAllPodVolumes(podId);
    }
  }

  async getContainerForPod(podId: string): Promise<ContainerInfo | null> {
    return this.getContainer(this.generateContainerName(podId));
  }

  async getActiveContainerForPodOrThrow(podId: string): Promise<ContainerInfo> {
    const container = await this.getContainerForPod(podId);
    if (!container) {
      throw new Error(`Container ${podId} not found`);
    }
    if (container.status !== "running") {
      throw new Error(`Container ${podId} is not running`);
    }
    return container;
  }

  async getContainer(containerId: string): Promise<ContainerInfo | null> {
    try {
      const { stdout } = await this.exec(
        `docker inspect ${containerId} --format='{{json .}}'`,
        true,
      );

      const containerData = JSON.parse(stdout.trim());

      // Extract port mappings
      const ports: PortMapping[] = [];
      if (containerData.NetworkSettings?.Ports) {
        for (const [internalPort, hostBindings] of Object.entries(
          containerData.NetworkSettings.Ports,
        )) {
          if (hostBindings && Array.isArray(hostBindings)) {
            const [port, protocol] = internalPort.split("/");
            for (const binding of hostBindings) {
              ports.push({
                name: `port-${port}`,
                internal: parseInt(port, 10),
                external: parseInt(binding.HostPort, 10),
                protocol: protocol as "tcp" | "udp",
              });
            }
          }
        }
      }

      return {
        id: containerData.Id,
        name: containerData.Name.replace("/", ""), // Remove leading slash
        status: this.mapDockerStatus(containerData.State.Status),
        podId: this.extractPodIdFromName(containerData.Name),
        internalIp: containerData.NetworkSettings?.IPAddress || undefined,
        ports,
        createdAt: new Date(containerData.Created),
        startedAt: containerData.State.StartedAt
          ? new Date(containerData.State.StartedAt)
          : undefined,
        stoppedAt:
          containerData.State.FinishedAt &&
          containerData.State.FinishedAt !== "0001-01-01T00:00:00Z"
            ? new Date(containerData.State.FinishedAt)
            : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("No such container") ||
        message.includes("No such object")
      ) {
        return null;
      }
      console.error(`[GVisorRuntime] Failed to get container info: ${message}`);
      throw new Error(`Container inspection failed: ${message}`);
    }
  }

  async listContainers(
    filters: Record<string, string> = {},
  ): Promise<ContainerInfo[]> {
    try {
      let filterArgs = "";
      if (Object.keys(filters).length > 0) {
        filterArgs = Object.entries(filters)
          .map(([key, value]) => `--filter "${key}=${value}"`)
          .join(" ");
      }

      const { stdout } = await this.exec(
        `docker ps -a ${filterArgs} --format='{{.ID}}'`,
        true,
      );
      const containerIds = stdout.trim().split("\n").filter(Boolean);

      const containers: ContainerInfo[] = [];
      for (const id of containerIds) {
        const container = await this.getContainer(id);
        if (container) {
          containers.push(container);
        }
      }

      return containers;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[GVisorRuntime] Failed to list containers: ${message}`);
      throw new Error(`Container listing failed: ${message}`);
    }
  }

  async execInContainer(
    podId: string,
    containerId: string,
    command: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      // Properly quote each argument to preserve them as separate arguments to docker exec
      const quotedArgs = command.map((arg) => {
        if (
          !arg.startsWith("'") &&
          !arg.endsWith("'") &&
          (arg.includes(" ") ||
            arg.includes("&") ||
            arg.includes("|") ||
            arg.includes(">") ||
            arg.includes("<") ||
            arg.includes("$") ||
            arg.includes("(") ||
            arg.includes(")") ||
            arg.includes(";") ||
            arg.includes('"') ||
            arg.includes("'"))
        ) {
          // If argument contains special shell characters, quote it
          // Escape single quotes by replacing ' with '\''
          const escaped = arg.replace(/'/g, "'\\''");
          return `'${escaped}'`;
        }
        return arg;
      });

      const commandStr = quotedArgs.join(" ");
      const dockerCommand = `docker exec ${containerId} ${commandStr}`;

      const { stdout, stderr } = await this.exec(dockerCommand, true, {
        podId,
        command: commandStr,
      });

      return {
        stdout,
        stderr,
        exitCode: 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as Record<string, unknown>).code)
          : "unknown";
      if (code !== "unknown") {
        new Error(`Failed to execute command (exit code ${code}): ${message}`);
      }
      throw error;
    }
  }

  async getContainerLogs(
    containerId: string,
    options: { tail?: number; follow?: boolean } = {},
  ): Promise<string> {
    try {
      let dockerCommand = `docker logs ${containerId}`;

      if (options.tail) {
        dockerCommand += ` --tail ${options.tail}`;
      }

      if (options.follow) {
        dockerCommand += " --follow";
      }

      const { stdout } = await this.exec(dockerCommand, true);
      return stdout;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[GVisorRuntime] Failed to get container logs: ${message}`);
      throw new Error(`Container logs retrieval failed: ${message}`);
    }
  }

  // Helper methods
  private mapDockerStatus(dockerStatus: string): ContainerInfo["status"] {
    switch (dockerStatus) {
      case "created":
        return "created";
      case "running":
        return "running";
      case "paused":
        return "paused";
      case "exited":
      case "stopped":
        return "stopped";
      case "dead":
        return "dead";
      default:
        return "stopped";
    }
  }

  private extractPodIdFromName(containerName: string): string {
    // Extract pod ID from container name format: pinacle-pod-{podId}
    const match = containerName.match(/pinacle-pod-(.+)/);
    return match ? match[1] : containerName;
  }

  // Additional gVisor-specific methods
  async getGVisorInfo(): Promise<{ version: string; runtime: string }> {
    try {
      const { stdout } = await this.exec("runsc --version", false);
      const versionMatch = stdout.match(/runsc version (.+)/);
      const version = versionMatch ? versionMatch[1] : "unknown";

      return {
        version,
        runtime: "gvisor",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[GVisorRuntime] Failed to get gVisor info: ${message}`);
      throw new Error(`gVisor info retrieval failed: ${message}`);
    }
  }

  async validateGVisorRuntime(): Promise<boolean> {
    try {
      // Test if gVisor runtime is available
      const { stdout } = await this.exec(
        "docker info --format='{{.Runtimes}}'",
        true,
      );
      return stdout.includes("runsc");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[GVisorRuntime] gVisor validation failed: ${message}`);
      return false;
    }
  }

  // Volume management methods
  async createVolume(podId: string, volumeName: string): Promise<void> {
    const fullVolumeName = this.generateVolumeName(podId, volumeName);

    try {
      // Check if volume already exists
      const { stdout } = await this.exec(
        `docker volume inspect ${fullVolumeName}`,
        true,
      );

      if (stdout.trim()) {
        console.log(
          `[GVisorRuntime] Volume ${fullVolumeName} already exists, reusing it`,
        );
        return;
      }
    } catch {
      // Volume doesn't exist, create it
    }

    try {
      await this.exec(`docker volume create ${fullVolumeName}`, true);
      console.log(`[GVisorRuntime] Created volume: ${fullVolumeName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[GVisorRuntime] Failed to create volume: ${message}`);
      throw new Error(`Volume creation failed: ${message}`);
    }
  }

  async removeVolume(podId: string, volumeName: string): Promise<void> {
    const fullVolumeName = this.generateVolumeName(podId, volumeName);

    try {
      await this.exec(`docker volume rm ${fullVolumeName}`, true);
      console.log(`[GVisorRuntime] Removed volume: ${fullVolumeName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[GVisorRuntime] Failed to remove volume ${fullVolumeName}: ${message}`,
      );
      // Don't throw - volume might not exist or be in use
    }
  }

  async removeAllPodVolumes(podId: string): Promise<void> {
    try {
      // List all volumes for this pod
      const { stdout } = await this.exec(
        `docker volume ls --filter "name=pinacle-vol-${podId}-" --format "{{.Name}}"`,
        true,
      );

      const volumeNames = stdout
        .trim()
        .split("\n")
        .filter((name) => name.trim());

      for (const volumeName of volumeNames) {
        try {
          await this.exec(`docker volume rm ${volumeName}`, true);
          console.log(`[GVisorRuntime] Removed volume: ${volumeName}`);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.warn(
            `[GVisorRuntime] Failed to remove volume ${volumeName}: ${message}`,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[GVisorRuntime] Failed to list pod volumes: ${message}`);
    }
  }
}
