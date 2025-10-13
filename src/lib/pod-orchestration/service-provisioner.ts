import {
  getAllServiceTemplates,
  getServiceTemplateUnsafe,
  type ServiceContext,
  type ServiceTemplate,
} from "./service-registry";
import type {
  IServiceProvisioner,
  ServerConnection,
  ServiceConfig,
} from "./types";

export class ServiceProvisioner implements IServiceProvisioner {
  private serverConnection: ServerConnection;

  constructor(serverConnection: ServerConnection, podId?: string) {
    this.serverConnection = serverConnection;

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
      console.error(`[ServiceProvisioner] Command failed: ${message}`);
      throw error;
    }
  }

  private async execInContainer(
    containerId: string,
    command: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    // Join commands and properly escape for sh -c
    const commandStr = command.join(" ");
    // Escape single quotes by replacing ' with '\''
    const escapedCommand = commandStr.replace(/'/g, "'\\''");
    const dockerCommand = `docker exec ${containerId} sh -c '${escapedCommand}'`;
    return this.exec(dockerCommand, true, commandStr); // Pass original command for logging
  }

  async provisionService(
    podId: string,
    service: ServiceConfig,
    githubRepo?: string,
  ): Promise<void> {
    const template = getServiceTemplateUnsafe(service.name);
    const containerName = `pinacle-pod-${podId}`;

    try {
      console.log(
        `[ServiceProvisioner] Provisioning service ${service.name} for pod ${podId}`,
      );

      // Check if container exists and is running
      const { stdout: containerStatus } = await this.exec(
        `docker inspect ${containerName} --format='{{.State.Status}}' 2>/dev/null || echo "not_found"`,
        true,
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

        // Create OpenRC service script with custom working directory if GitHub repo is present
        await this.createServiceScript(
          containerName,
          service.name,
          template,
          githubRepo,
        );
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

      console.log(
        `[ServiceProvisioner] Successfully provisioned service ${service.name}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ServiceProvisioner] Failed to provision service ${service.name}: ${message}`,
      );
      throw new Error(`Service provisioning failed: ${message}`);
    }
  }

  async startService(podId: string, serviceName: string): Promise<void> {
    const containerName = `pinacle-pod-${podId}`;

    try {
      console.log(
        `[ServiceProvisioner] Starting service ${serviceName} for pod ${podId}`,
      );

      // Start using OpenRC
      await this.execInContainer(containerName, [
        "rc-service",
        serviceName,
        "start",
      ]);

      // Wait a moment for service to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify service is running
      const isHealthy = await this.checkServiceHealth(
        podId,
        serviceName,
        10_000,
      );
      if (!isHealthy) {
        throw new Error(
          `Service ${serviceName} failed health check after start`,
        );
      }

      console.log(
        `[ServiceProvisioner] Successfully started service ${serviceName}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ServiceProvisioner] Failed to start service ${serviceName}: ${message}`,
      );
      throw new Error(`Service start failed: ${message}`);
    }
  }

  async stopService(podId: string, serviceName: string): Promise<void> {
    const containerName = `pinacle-pod-${podId}`;

    try {
      console.log(
        `[ServiceProvisioner] Stopping service ${serviceName} for pod ${podId}`,
      );

      // Stop using OpenRC
      await this.execInContainer(containerName, [
        "rc-service",
        serviceName,
        "stop",
      ]);

      console.log(
        `[ServiceProvisioner] Successfully stopped service ${serviceName}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ServiceProvisioner] Failed to stop service ${serviceName}: ${message}`,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ServiceProvisioner] Failed to remove service ${serviceName}: ${message}`,
      );
      throw new Error(`Service removal failed: ${message}`);
    }
  }

  async getServiceStatus(
    podId: string,
    serviceName: string,
  ): Promise<"running" | "stopped" | "failed"> {
    const containerName = `pinacle-pod-${podId}`;

    try {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ServiceProvisioner] Failed to get service status: ${message}`,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ServiceProvisioner] Failed to get service logs: ${message}`,
      );
      return `Error retrieving logs: ${message}`;
    }
  }

  async checkServiceHealth(
    podId: string,
    serviceName: string,
    timeout: number = 0,
  ): Promise<boolean> {
    const template = getServiceTemplateUnsafe(serviceName);
    const containerName = `pinacle-pod-${podId}`;

    if (!template) {
      // For custom services, just check if they're running
      const status = await this.getServiceStatus(podId, serviceName);
      return status === "running";
    }

    const startTime = Date.now();
    let retries = 0;
    while (true) {
      try {
        // Run health check command
        const healthCmd = template.healthCheckCommand.join(" ");
        await this.execInContainer(containerName, [
          "sh",
          "-c",
          `'${healthCmd.replace(/'/g, "\\'")} >/dev/null && echo "OK"'`,
        ]);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (Date.now() - startTime > timeout) {
          console.log(
            `[ServiceProvisioner] Health check failed for ${serviceName}: ${message} (timeout after ${timeout}ms)`,
          );
          return false;
        }
        retries++;
        console.log(
          `[ServiceProvisioner] Health check failed for ${serviceName}: ${message} (retry #${retries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async createServiceScript(
    containerName: string,
    serviceName: string,
    template: ServiceTemplate,
    githubRepo?: string,
  ): Promise<void> {
    // Create OpenRC-compatible init script for Alpine
    const envVars = Object.entries(template.environment || {})
      .map(([key, value]) => `export ${key}="${value}"`)
      .join("\n");
    const validName = serviceName
      .toLowerCase()
      .replace(/ /g, "-")
      .replace(/[^a-z0-9-]/g, "");
    if (validName !== serviceName) {
      throw new Error(
        `Service name ${serviceName} is not valid for OpenRC, should not have spaces or special characters`,
      );
    }

    // Build service context for startCommand function
    const context: ServiceContext = {
      projectFolder: githubRepo,
    };

    // Get the start command from the template function
    const startCommandArray = template.startCommand(context);
    const command = startCommandArray[0];
    const commandArgs = startCommandArray.slice(1).join(" ");

    const serviceScript = `#!/sbin/openrc-run

name="${serviceName}"
description="Auto-generated service for ${serviceName}"
${envVars}
command="${command}"
command_args="${commandArgs.replace("*", "\\*")}"
pidfile="/tmp/${serviceName}.pid"
command_background="yes"

output_log="/var/log/${serviceName}.log"
error_log="/var/log/${serviceName}.log"

depend() {
    need net
}

stop_pre() {
    if [ -f "/tmp/${serviceName}.pid" ]; then
        ${template.cleanupCommand.join(" ") || "true"}
    fi
}
`;

    // Create OpenRC service script using heredoc to avoid all escaping issues
    const writeScriptCommand = `cat > /etc/init.d/${serviceName} << 'PINACLE_EOF'
${serviceScript}
PINACLE_EOF
chmod +x /etc/init.d/${serviceName}`;

    await this.execInContainer(containerName, [writeScriptCommand]);
  }

  // Utility methods
  getAvailableServices(): string[] {
    return getAllServiceTemplates().map((t) => t.name);
  }

  getServiceTemplateInfo(serviceName: string): ServiceTemplate | undefined {
    return getServiceTemplateUnsafe(serviceName);
  }

  async listRunningServices(podId: string): Promise<string[]> {
    const runningServices: string[] = [];

    for (const template of getAllServiceTemplates()) {
      const status = await this.getServiceStatus(podId, template.name);
      if (status === "running") {
        runningServices.push(template.name);
      }
    }

    return runningServices;
  }
}
