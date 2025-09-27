import { exec } from "child_process";
import { promisify } from "util";
import type { LimaConfig, ServiceConfig, ServiceProvisioner } from "./types";

const execAsync = promisify(exec);

interface ServiceTemplate {
  name: string;
  image?: string;
  installScript: string[];
  startCommand: string[];
  stopCommand: string[];
  healthCheckCommand: string[];
  defaultPort: number;
  environment?: Record<string, string>;
}

export class LimaServiceProvisioner implements ServiceProvisioner {
  private limaConfig: LimaConfig;
  private serviceTemplates: Map<string, ServiceTemplate> = new Map();
  private isDevMode: boolean;

  constructor(limaConfig: LimaConfig = { vmName: "gvisor-alpine" }) {
    this.limaConfig = limaConfig;
    // Use Lima only in development on macOS
    this.isDevMode =
      process.env.NODE_ENV === "development" && process.platform === "darwin";
    this.initializeServiceTemplates();
  }

  private initializeServiceTemplates(): void {
    // VS Code Server
    this.serviceTemplates.set("code-server", {
      name: "code-server",
      installScript: [],
      startCommand: [
        "code-server",
        "--bind-addr",
        "0.0.0.0:8726",
        "--auth",
        "none",
      ],
      stopCommand: ["pkill", "-f", "code-server"],
      healthCheckCommand: ["curl", "-f", "http://localhost:8726"],
      defaultPort: 8726,
    });

    // Vibe Kanban
    this.serviceTemplates.set("vibe-kanban", {
      name: "vibe-kanban",
      installScript: ["npm install -g vibe-kanban"],
      startCommand: ["PORT=5262 HOST=0.0.0.0", "vibe-kanban"],
      stopCommand: ["pkill", "-f", "vibe-kanban"],
      healthCheckCommand: ["curl", "-f", "http://localhost:5262"],
      defaultPort: 5262,
      environment: {
        NODE_ENV: "production",
        PORT: "5262",
      },
    });

    // Claude Code (simulated - would need actual implementation)
    this.serviceTemplates.set("claude-code", {
      name: "claude-code",
      installScript: ["sudo npm install -g @anthropic-ai/claude-code"],
      startCommand: [
        "ttyd",
        "-p",
        "2528",
        "-i",
        "0.0.0.0",
        "-w",
        "/workspace",
        "--writable",
        "--",
        "tmux new -As claude claude",
      ],
      stopCommand: ["pkill", "-f", "claude"],
      healthCheckCommand: ["curl", "-f", "http://localhost:2528/health"],
      defaultPort: 2528,
      environment: {
        CLAUDE_API_KEY: "${ANTHROPIC_API_KEY}",
      },
    });

    // Web-based terminal (ttyd)
    this.serviceTemplates.set("web-terminal", {
      name: "web-terminal",
      installScript: [],
      // e.g.: http://localhost:7681/?arg=0, or http://localhost:7681/?arg=1
      startCommand: [
        "ttyd",
        "-p",
        "7681",
        "-i",
        "0.0.0.0",
        "-w",
        "/workspace",
        "--writable",
        "--url-arg",
        "--",
        "tmux new -As",
      ],
      stopCommand: ["pkill", "-f", "ttyd"],
      healthCheckCommand: ["curl", "-f", "http://localhost:7681"],
      defaultPort: 7681,
    });
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
      console.log(`[ServiceProvisioner] Executing: ${fullCommand}`);
    } else {
      // Production mode: direct execution
      fullCommand = useSudo ? `sudo ${command}` : command;
      console.log(`[ServiceProvisioner] Executing: ${fullCommand}`);
    }

    try {
      const result = await execAsync(fullCommand);
      return result;
    } catch (error: any) {
      console.error(`[ServiceProvisioner] Command failed: ${error.message}`);
      throw error;
    }
  }

  private async execLima(
    command: string,
  ): Promise<{ stdout: string; stderr: string }> {
    return this.execDockerCommand(command, false);
  }

  private async execInContainer(
    containerId: string,
    command: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    const escapedCommand = `"${command.join(" ").replace(/"/g, '\\"')}"`;
    const dockerCommand = `docker exec ${containerId} sh -c ${escapedCommand}`;
    return this.execDockerCommand(dockerCommand, true); // Always use sudo for docker exec
  }

  async provisionService(podId: string, service: ServiceConfig): Promise<void> {
    const template = this.serviceTemplates.get(service.name);
    const containerName = `pinacle-pod-${podId}`;

    try {
      console.log(
        `[ServiceProvisioner] Provisioning service ${service.name} for pod ${podId}`,
      );

      // Check if container exists and is running
      const { stdout: containerStatus } = await this.execLima(
        `sudo docker inspect ${containerName} --format='{{.State.Status}}' 2>/dev/null || echo "not_found"`,
      );

      if (containerStatus.trim() === "not_found") {
        throw new Error(`Container ${containerName} not found`);
      }

      if (containerStatus.trim() !== "running") {
        throw new Error(`Container ${containerName} is not running`);
      }

      // Install service if template exists
      if (template) {
        console.log(
          `[ServiceProvisioner] Installing ${service.name} using template`,
        );

        // Run installation commands
        for (const installCmd of template.installScript) {
          await this.execInContainer(containerName, [installCmd]);
        }
      } else if (service.image) {
        // Custom service with Docker image - would need to run as sidecar
        console.log(
          `[ServiceProvisioner] Custom service ${service.name} with image ${service.image}`,
        );
        // Implementation would depend on how we want to handle multi-container pods
      } else {
        // Custom service with commands
        console.log(
          `[ServiceProvisioner] Custom service ${service.name} with custom commands`,
        );
        if (service.command && service.command.length > 0) {
          // Install any dependencies specified in the command
          await this.execInContainer(containerName, service.command);
        }
      }

      // Set up environment variables
      const envVars = { ...template?.environment, ...service.environment };
      for (const [key, value] of Object.entries(envVars)) {
        await this.execInContainer(containerName, [
          "sh",
          "-c",
          `echo 'export ${key}="${value}"' >> ~/.bashrc`,
        ]);
      }

      // Create systemd service or supervisor config for auto-restart
      if (service.autoRestart && template) {
        await this.createServiceScript(containerName, service.name, template);
      }

      console.log(
        `[ServiceProvisioner] Successfully provisioned service ${service.name}`,
      );
    } catch (error: any) {
      console.error(
        `[ServiceProvisioner] Failed to provision service ${service.name}: ${error.message}`,
      );
      throw new Error(`Service provisioning failed: ${error.message}`);
    }
  }

  async startService(podId: string, serviceName: string): Promise<void> {
    const template = this.serviceTemplates.get(serviceName);
    const containerName = `pinacle-pod-${podId}`;

    try {
      console.log(
        `[ServiceProvisioner] Starting service ${serviceName} for pod ${podId}`,
      );

      if (template) {
        // Start using template command
        const startCmd = template.startCommand.join(" ");
        await this.execInContainer(containerName, [
          "sh",
          "-c",
          `nohup ${startCmd} > /tmp/${serviceName}.log 2>&1 & echo $! > /tmp/${serviceName}.pid`,
        ]);
      } else {
        // Start using OpenRC
        await this.execInContainer(containerName, [
          "rc-service",
          serviceName,
          "start",
        ]);
      }

      // Wait a moment for service to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify service is running
      const isHealthy = await this.checkServiceHealth(podId, serviceName);
      if (!isHealthy) {
        throw new Error(
          `Service ${serviceName} failed health check after start`,
        );
      }

      console.log(
        `[ServiceProvisioner] Successfully started service ${serviceName}`,
      );
    } catch (error: any) {
      console.error(
        `[ServiceProvisioner] Failed to start service ${serviceName}: ${error.message}`,
      );
      throw new Error(`Service start failed: ${error.message}`);
    }
  }

  async stopService(podId: string, serviceName: string): Promise<void> {
    const template = this.serviceTemplates.get(serviceName);
    const containerName = `pinacle-pod-${podId}`;

    try {
      console.log(
        `[ServiceProvisioner] Stopping service ${serviceName} for pod ${podId}`,
      );

      if (template) {
        // Stop using template command
        const stopCmd = template.stopCommand.join(" ");
        await this.execInContainer(containerName, ["sh", "-c", stopCmd]);
      } else {
        // Stop using OpenRC
        await this.execInContainer(containerName, [
          "rc-service",
          serviceName,
          "stop",
        ]);
      }

      console.log(
        `[ServiceProvisioner] Successfully stopped service ${serviceName}`,
      );
    } catch (error: any) {
      console.error(
        `[ServiceProvisioner] Failed to stop service ${serviceName}: ${error.message}`,
      );
      // Don't throw error for stop failures - service might already be stopped
    }
  }

  async removeService(podId: string, serviceName: string): Promise<void> {
    const containerName = `pinacle-pod-${podId}`;

    try {
      console.log(
        `[ServiceProvisioner] Removing service ${serviceName} for pod ${podId}`,
      );

      // Stop service first
      await this.stopService(podId, serviceName);

      // Remove service files and configurations
      await this.execInContainer(containerName, [
        "sh",
        "-c",
        `rm -f /tmp/${serviceName}.pid /tmp/${serviceName}.log /etc/init.d/${serviceName}`,
      ]);

      console.log(
        `[ServiceProvisioner] Successfully removed service ${serviceName}`,
      );
    } catch (error: any) {
      console.error(
        `[ServiceProvisioner] Failed to remove service ${serviceName}: ${error.message}`,
      );
      throw new Error(`Service removal failed: ${error.message}`);
    }
  }

  async getServiceStatus(
    podId: string,
    serviceName: string,
  ): Promise<"running" | "stopped" | "failed"> {
    const template = this.serviceTemplates.get(serviceName);
    const containerName = `pinacle-pod-${podId}`;

    try {
      if (template) {
        // Check if process is running using PID file
        const { stdout } = await this.execInContainer(containerName, [
          "sh",
          "-c",
          `if [ -f /tmp/${serviceName}.pid ]; then kill -0 $(cat /tmp/${serviceName}.pid) 2>/dev/null && echo "running" || echo "stopped"; else echo "stopped"; fi`,
        ]);

        const status = stdout.trim();
        return status === "running" ? "running" : "stopped";
      } else {
        // Check using OpenRC
        const { stdout } = await this.execInContainer(containerName, [
          "rc-service",
          serviceName,
          "status",
        ]);

        if (stdout.includes("started") || stdout.includes("running")) {
          return "running";
        } else {
          return "stopped";
        }
      }
    } catch (error: any) {
      console.error(
        `[ServiceProvisioner] Failed to get service status: ${error.message}`,
      );
      return "failed";
    }
  }

  async getServiceLogs(
    podId: string,
    serviceName: string,
    options: { tail?: number } = {},
  ): Promise<string> {
    const containerName = `pinacle-pod-${podId}`;

    try {
      const tailOption = options.tail ? ` | tail -${options.tail}` : "";
      const { stdout } = await this.execInContainer(containerName, [
        "sh",
        "-c",
        `cat /tmp/${serviceName}.log 2>/dev/null${tailOption} || echo "No logs available"`,
      ]);

      return stdout;
    } catch (error: any) {
      console.error(
        `[ServiceProvisioner] Failed to get service logs: ${error.message}`,
      );
      return `Error retrieving logs: ${error.message}`;
    }
  }

  async checkServiceHealth(
    podId: string,
    serviceName: string,
  ): Promise<boolean> {
    const template = this.serviceTemplates.get(serviceName);
    const containerName = `pinacle-pod-${podId}`;

    if (!template) {
      // For custom services, just check if they're running
      const status = await this.getServiceStatus(podId, serviceName);
      return status === "running";
    }

    try {
      // Run health check command
      const healthCmd = template.healthCheckCommand.join(" ");
      await this.execInContainer(containerName, ["sh", "-c", healthCmd]);
      return true;
    } catch (error: any) {
      console.log(
        `[ServiceProvisioner] Health check failed for ${serviceName}: ${error.message}`,
      );
      return false;
    }
  }

  private async createServiceScript(
    containerName: string,
    serviceName: string,
    template: ServiceTemplate,
  ): Promise<void> {
    // Create OpenRC-compatible init script for Alpine
    const serviceScript = `#!/sbin/openrc-run

name="${serviceName}"
description="Auto-generated service for \${name}"
command="${template.startCommand[0]}"
command_args="${template.startCommand.slice(1).join(" ")}"
pidfile="/tmp/\${name}.pid"
command_background="yes"
start_stop_daemon_args="--stdout /tmp/\${name}.log --stderr /tmp/\${name}.log"

depend() {
    need net
}

stop_pre() {
    if [ -f "\${pidfile}" ]; then
        ${template.stopCommand.join(" ")}
    fi
}
`;

    // Create OpenRC service script
    await this.execInContainer(containerName, [
      `mkdir -p /etc/init.d && echo '${serviceScript}' > /etc/init.d/${serviceName} && chmod +x /etc/init.d/${serviceName}`,
    ]);
  }

  // Utility methods
  getAvailableServices(): string[] {
    return Array.from(this.serviceTemplates.keys());
  }

  getServiceTemplate(serviceName: string): ServiceTemplate | undefined {
    return this.serviceTemplates.get(serviceName);
  }

  async listRunningServices(podId: string): Promise<string[]> {
    const runningServices: string[] = [];

    for (const serviceName of this.serviceTemplates.keys()) {
      const status = await this.getServiceStatus(podId, serviceName);
      if (status === "running") {
        runningServices.push(serviceName);
      }
    }

    return runningServices;
  }
}
