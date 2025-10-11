import { env } from "@/env";
import { SSHServerConnection } from "./server-connection";
import type {
  ContainerInfo,
  ContainerRuntime,
  LimaConfig,
  PodSpec,
  PortMapping,
  ServerConnection,
} from "./types";

export class LimaGVisorRuntime implements ContainerRuntime {
  private serverConnection: ServerConnection;

  constructor(
    limaConfig: LimaConfig,
    serverConnection?: ServerConnection,
    podId?: string,
  ) {
    // Use provided connection or create default Lima connection for dev
    if (serverConnection) {
      this.serverConnection = serverConnection;
    } else {
      // Default: create Lima SSH connection for development
      if (!env.SSH_PRIVATE_KEY) {
        throw new Error("SSH_PRIVATE_KEY not found in environment");
      }

      this.serverConnection = new SSHServerConnection({
        host: "127.0.0.1",
        port: limaConfig.sshPort,
        user: process.env.USER || "root",
        privateKey: env.SSH_PRIVATE_KEY,
      });
    }

    // Set podId for logging if provided
    if (podId) {
      this.serverConnection.setPodId(podId);
    }
  }

  private async exec(
    command: string,
    useSudo: boolean = false,
    containerCommand?: string,
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

  private parseResourceLimits(spec: PodSpec): string {
    const { resources } = spec;
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

  async createContainer(spec: PodSpec): Promise<ContainerInfo> {
    const containerName = this.generateContainerName(spec.id);
    const resourceLimits = this.parseResourceLimits(spec);
    const portMappings = this.parsePortMappings(spec.network.ports);
    const envVars = this.parseEnvironmentVars(spec.environment);

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
      // Volume mounts
      "--volume",
      "/tmp:/tmp",
      "--volume",
      `pinacle-${spec.id}-workspace:/workspace`,
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
        `[LimaRuntime] Created container ${containerName} with ID: ${containerId}`,
      );
      return containerInfo;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[LimaRuntime] Failed to create container: ${message}`);
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

      console.log(`[LimaRuntime] Started container: ${containerId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[LimaRuntime] Failed to start container: ${message}`);
      throw new Error(`Container start failed: ${message}`);
    }
  }

  async stopContainer(containerId: string): Promise<void> {
    try {
      await this.exec(`docker stop ${containerId}`, true);
      console.log(`[LimaRuntime] Stopped container: ${containerId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[LimaRuntime] Failed to stop container: ${message}`);
      throw new Error(`Container stop failed: ${message}`);
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

      await this.exec(`docker rm ${containerId}`, true);
      console.log(`[LimaRuntime] Removed container: ${containerId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[LimaRuntime] Failed to remove container: ${message}`);
      throw new Error(`Container removal failed: ${message}`);
    }
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
      if (message.includes("No such container")) {
        return null;
      }
      console.error(`[LimaRuntime] Failed to get container info: ${message}`);
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
      console.error(`[LimaRuntime] Failed to list containers: ${message}`);
      throw new Error(`Container listing failed: ${message}`);
    }
  }

  async execCommand(
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

      const { stdout, stderr } = await this.exec(
        dockerCommand,
        true,
        commandStr,
      );

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
        throw new Error(
          `Failed to execute command (exit code ${code}): ${message}`,
        );
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
      console.error(`[LimaRuntime] Failed to get container logs: ${message}`);
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
      console.error(`[LimaRuntime] Failed to get gVisor info: ${message}`);
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
      console.error(`[LimaRuntime] gVisor validation failed: ${message}`);
      return false;
    }
  }
}
