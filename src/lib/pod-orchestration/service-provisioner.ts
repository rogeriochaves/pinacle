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

  constructor(limaConfig: LimaConfig = { vmName: "gvisor-alpine" }) {
    this.limaConfig = limaConfig;
    this.initializeServiceTemplates();
  }

  private initializeServiceTemplates(): void {
    // VS Code Server
    this.serviceTemplates.set("code-server", {
      name: "code-server",
      installScript: [
        "curl -fsSL https://code-server.dev/install.sh | sh",
        "mkdir -p ~/.config/code-server",
        "echo 'bind-addr: 0.0.0.0:8080' > ~/.config/code-server/config.yaml",
        "echo 'auth: none' >> ~/.config/code-server/config.yaml",
        "echo 'cert: false' >> ~/.config/code-server/config.yaml",
      ],
      startCommand: [
        "code-server",
        "--bind-addr",
        "0.0.0.0:8080",
        "--auth",
        "none",
      ],
      stopCommand: ["pkill", "-f", "code-server"],
      healthCheckCommand: ["curl", "-f", "http://localhost:8080"],
      defaultPort: 8080,
    });

    // Vibe Kanban
    this.serviceTemplates.set("vibe-kanban", {
      name: "vibe-kanban",
      installScript: [
        "curl -fsSL https://deb.nodesource.com/setup_18.x | bash -",
        "apt-get install -y nodejs",
        "npm install -g @vibe-kanban/server",
      ],
      startCommand: ["vibe-kanban", "--port", "3001", "--host", "0.0.0.0"],
      stopCommand: ["pkill", "-f", "vibe-kanban"],
      healthCheckCommand: ["curl", "-f", "http://localhost:3001"],
      defaultPort: 3001,
      environment: {
        NODE_ENV: "production",
        PORT: "3001",
      },
    });

    // Claude Code (simulated - would need actual implementation)
    this.serviceTemplates.set("claude-code", {
      name: "claude-code",
      installScript: ["curl -fsSL https://claude-code.dev/install.sh | sh"],
      startCommand: ["claude-code", "--server", "--port", "3002"],
      stopCommand: ["pkill", "-f", "claude-code"],
      healthCheckCommand: ["curl", "-f", "http://localhost:3002/health"],
      defaultPort: 3002,
      environment: {
        CLAUDE_API_KEY: "${ANTHROPIC_API_KEY}",
      },
    });

    // Terminal/SSH service
    this.serviceTemplates.set("terminal", {
      name: "terminal",
      installScript: [
        "apt-get update",
        "apt-get install -y openssh-server",
        "mkdir -p /var/run/sshd",
        "echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config",
        "echo 'PasswordAuthentication no' >> /etc/ssh/sshd_config",
        "echo 'PubkeyAuthentication yes' >> /etc/ssh/sshd_config",
      ],
      startCommand: ["/usr/sbin/sshd", "-D", "-p", "2222"],
      stopCommand: ["pkill", "-f", "sshd"],
      healthCheckCommand: ["nc", "-z", "localhost", "2222"],
      defaultPort: 2222,
    });

    // Web-based terminal (ttyd)
    this.serviceTemplates.set("web-terminal", {
      name: "web-terminal",
      installScript: [
        "apt-get update",
        "apt-get install -y build-essential cmake git libjson-c-dev libwebsockets-dev",
        "git clone https://github.com/tsl0922/ttyd.git /tmp/ttyd",
        "cd /tmp/ttyd && mkdir build && cd build",
        "cmake .. && make && make install",
      ],
      startCommand: ["ttyd", "-p", "3003", "-i", "0.0.0.0", "bash"],
      stopCommand: ["pkill", "-f", "ttyd"],
      healthCheckCommand: ["curl", "-f", "http://localhost:3003"],
      defaultPort: 3003,
    });
  }

  private async execLima(
    command: string,
  ): Promise<{ stdout: string; stderr: string }> {
    const fullCommand = `limactl shell ${this.limaConfig.vmName} -- ${command}`;
    console.log(`[ServiceProvisioner] Executing: ${fullCommand}`);

    try {
      const result = await execAsync(fullCommand);
      return result;
    } catch (error: any) {
      console.error(`[ServiceProvisioner] Command failed: ${error.message}`);
      throw error;
    }
  }

  private async execInContainer(
    containerId: string,
    command: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    const escapedCommand = command
      .map((c) => `"${c.replace(/"/g, '\\"')}"`)
      .join(" ");
    const dockerCommand = `sudo docker exec ${containerId} sh -c ${escapedCommand}`;
    return this.execLima(dockerCommand);
  }

  private generateServiceName(podId: string, serviceName: string): string {
    return `${podId}-${serviceName}`;
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

        // Update package manager first
        await this.execInContainer(containerName, ["apt-get", "update"]);

        // Run installation commands
        for (const installCmd of template.installScript) {
          await this.execInContainer(containerName, ["sh", "-c", installCmd]);
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
        // Try to start using service script
        await this.execInContainer(containerName, [
          "service",
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
        // Try to stop using service script
        await this.execInContainer(containerName, [
          "service",
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
        `rm -f /tmp/${serviceName}.pid /tmp/${serviceName}.log /etc/systemd/system/${serviceName}.service`,
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
        // Check using service command
        const { stdout } = await this.execInContainer(containerName, [
          "service",
          serviceName,
          "status",
        ]);

        if (stdout.includes("active") || stdout.includes("running")) {
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
    const serviceScript = `#!/bin/bash
# Auto-generated service script for ${serviceName}
case "$1" in
  start)
    echo "Starting ${serviceName}..."
    nohup ${template.startCommand.join(" ")} > /tmp/${serviceName}.log 2>&1 & echo $! > /tmp/${serviceName}.pid
    ;;
  stop)
    echo "Stopping ${serviceName}..."
    ${template.stopCommand.join(" ")}
    rm -f /tmp/${serviceName}.pid
    ;;
  restart)
    $0 stop
    sleep 2
    $0 start
    ;;
  status)
    if [ -f /tmp/${serviceName}.pid ]; then
      if kill -0 $(cat /tmp/${serviceName}.pid) 2>/dev/null; then
        echo "${serviceName} is running"
      else
        echo "${serviceName} is stopped"
      fi
    else
      echo "${serviceName} is stopped"
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
`;

    // Create service script
    await this.execInContainer(containerName, [
      "sh",
      "-c",
      `echo '${serviceScript}' > /usr/local/bin/${serviceName}-service && chmod +x /usr/local/bin/${serviceName}-service`,
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
