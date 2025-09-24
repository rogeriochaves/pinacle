import { exec } from "child_process";
import { promisify } from "util";
import type {
  ContainerInfo,
  ContainerRuntime,
  LimaConfig,
  PodConfig,
  PortMapping,
} from "./types";

const execAsync = promisify(exec);

export class LimaGVisorRuntime implements ContainerRuntime {
  private limaConfig: LimaConfig;
  private isDevMode: boolean;

  constructor(limaConfig: LimaConfig = { vmName: "gvisor-alpine" }) {
    this.limaConfig = limaConfig;
    // Use Lima only in development on macOS
    this.isDevMode = process.env.NODE_ENV === "development" && process.platform === "darwin";
  }

  private async execDockerCommand(
    command: string,
    useSudo: boolean = false,
  ): Promise<{ stdout: string; stderr: string }> {
    let fullCommand: string;

    if (this.isDevMode) {
      // Development mode: use Lima
      const sudoPrefix = useSudo ? "sudo " : "";
      fullCommand = `limactl shell ${this.limaConfig.vmName} -- ${sudoPrefix}${command}`;
      console.log(`[LimaRuntime] Executing: ${fullCommand}`);
    } else {
      // Production mode: direct Docker
      fullCommand = useSudo ? `sudo ${command}` : command;
      console.log(`[DockerRuntime] Executing: ${fullCommand}`);
    }

    try {
      const result = await execAsync(fullCommand);
      return result;
    } catch (error: any) {
      const runtimeType = this.isDevMode ? "LimaRuntime" : "DockerRuntime";
      console.error(`[${runtimeType}] Command failed: ${error.message}`);
      throw error;
    }
  }

  private async execLima(
    command: string,
  ): Promise<{ stdout: string; stderr: string }> {
    return this.execDockerCommand(command, false);
  }

  private async execLimaSudo(
    command: string,
  ): Promise<{ stdout: string; stderr: string }> {
    return this.execDockerCommand(command, true);
  }

  private generateContainerName(podId: string): string {
    return `pinacle-pod-${podId}`;
  }

  private parseResourceLimits(config: PodConfig): string {
    const { resources } = config;
    const limits: string[] = [];

    // Memory limit
    limits.push(`--memory=${resources.memoryMb}m`);

    // CPU limits
    if (resources.cpuQuota && resources.cpuPeriod) {
      limits.push(`--cpu-quota=${resources.cpuQuota}`);
      limits.push(`--cpu-period=${resources.cpuPeriod}`);
    } else {
      // Convert CPU cores to quota (1 core = 100000 microseconds per 100ms period)
      const cpuQuota = Math.floor(resources.cpuCores * 100000);
      limits.push(`--cpu-quota=${cpuQuota}`);
      limits.push(`--cpu-period=100000`);
    }

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

  async createContainer(config: PodConfig): Promise<ContainerInfo> {
    const containerName = this.generateContainerName(config.id);
    const resourceLimits = this.parseResourceLimits(config);
    const portMappings = this.parsePortMappings(config.network.ports);
    const envVars = this.parseEnvironmentVars(config.environment);

    // Build Docker run command with gVisor runtime - use array to avoid shell escaping issues
    const dockerArgs = [
      "docker", "create",
      "--runtime=runsc", // Use gVisor runtime
      "--name", containerName,
      ...resourceLimits.split(" ").filter(Boolean),
      ...portMappings.split(" ").filter(Boolean),
      ...envVars.split(" ").filter(Boolean),
      "--workdir", config.workingDir || "/workspace",
      "--user", config.user || "root",
      // Security options for gVisor
      "--security-opt", "seccomp=unconfined",
      "--cap-drop=ALL",
      "--cap-add=NET_BIND_SERVICE",
      // Network configuration
      "--network", "bridge", // Will create custom network later
      // Volume mounts
      "--volume", "/tmp:/tmp",
      "--volume", `pinacle-${config.id}-workspace:/workspace`,
      config.baseImage,
      // Default command - use sleep to keep container alive
      "sleep", "infinity"
    ].filter(Boolean);

    const dockerCommand = dockerArgs.join(" ");

    try {
      const { stdout } = await this.execLimaSudo(dockerCommand);
      const containerId = stdout.trim();

      // Get container info
      const containerInfo = await this.getContainer(containerId);
      if (!containerInfo) {
        throw new Error("Failed to retrieve created container info");
      }

      console.log(
        `[LimaRuntime] Created container ${containerName} with ID: ${containerId}`,
      );
      return containerInfo;
    } catch (error: any) {
      console.error(
        `[LimaRuntime] Failed to create container: ${error.message}`,
      );
      throw new Error(`Container creation failed: ${error.message}`);
    }
  }

  async startContainer(containerId: string): Promise<void> {
    try {
      await this.execLimaSudo(`docker start ${containerId}`);

      // Wait a moment for container to fully initialize
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify container is actually running
      const container = await this.getContainer(containerId);
      if (!container || container.status !== "running") {
        throw new Error(`Container failed to start properly: ${container?.status || "unknown"}`);
      }

      console.log(`[LimaRuntime] Started container: ${containerId}`);
    } catch (error: any) {
      console.error(
        `[LimaRuntime] Failed to start container: ${error.message}`,
      );
      throw new Error(`Container start failed: ${error.message}`);
    }
  }

  async stopContainer(containerId: string): Promise<void> {
    try {
      await this.execLimaSudo(`docker stop ${containerId}`);
      console.log(`[LimaRuntime] Stopped container: ${containerId}`);
    } catch (error: any) {
      console.error(`[LimaRuntime] Failed to stop container: ${error.message}`);
      throw new Error(`Container stop failed: ${error.message}`);
    }
  }

  async removeContainer(containerId: string): Promise<void> {
    try {
      // Stop container first if running
      try {
        await this.stopContainer(containerId);
      } catch {
        // Ignore if already stopped
      }

      await this.execLimaSudo(`docker rm ${containerId}`);
      console.log(`[LimaRuntime] Removed container: ${containerId}`);
    } catch (error: any) {
      console.error(
        `[LimaRuntime] Failed to remove container: ${error.message}`,
      );
      throw new Error(`Container removal failed: ${error.message}`);
    }
  }

  async getContainer(containerId: string): Promise<ContainerInfo | null> {
    try {
      const { stdout } = await this.execLimaSudo(
        `docker inspect ${containerId} --format='{{json .}}'`,
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
                internal: parseInt(port),
                external: parseInt(binding.HostPort),
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
    } catch (error: any) {
      if (error.message.includes("No such container")) {
        return null;
      }
      console.error(
        `[LimaRuntime] Failed to get container info: ${error.message}`,
      );
      throw new Error(`Container inspection failed: ${error.message}`);
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

      const { stdout } = await this.execLimaSudo(
        `docker ps -a ${filterArgs} --format='{{.ID}}'`,
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
    } catch (error: any) {
      console.error(
        `[LimaRuntime] Failed to list containers: ${error.message}`,
      );
      throw new Error(`Container listing failed: ${error.message}`);
    }
  }

  async execCommand(
    containerId: string,
    command: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      // Build the command more carefully to avoid escaping issues
      const commandStr = command.join(" ");
      const dockerCommand = `docker exec ${containerId} ${commandStr}`;

      const { stdout, stderr } = await this.execLimaSudo(dockerCommand);

      return {
        stdout,
        stderr,
        exitCode: 0,
      };
    } catch (error: any) {
      return {
        stdout: "",
        stderr: error.message,
        exitCode: error.code || 1,
      };
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

      const { stdout } = await this.execLimaSudo(dockerCommand);
      return stdout;
    } catch (error: any) {
      console.error(
        `[LimaRuntime] Failed to get container logs: ${error.message}`,
      );
      throw new Error(`Container logs retrieval failed: ${error.message}`);
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
      const { stdout } = await this.execLima("runsc --version");
      const versionMatch = stdout.match(/runsc version (.+)/);
      const version = versionMatch ? versionMatch[1] : "unknown";

      return {
        version,
        runtime: "gvisor",
      };
    } catch (error: any) {
      console.error(
        `[LimaRuntime] Failed to get gVisor info: ${error.message}`,
      );
      throw new Error(`gVisor info retrieval failed: ${error.message}`);
    }
  }

  async validateGVisorRuntime(): Promise<boolean> {
    try {
      // Test if gVisor runtime is available
      const { stdout } = await this.execLimaSudo(
        "docker info --format='{{.Runtimes}}'",
      );
      return stdout.includes("runsc");
    } catch (error: any) {
      console.error(`[LimaRuntime] gVisor validation failed: ${error.message}`);
      return false;
    }
  }
}
