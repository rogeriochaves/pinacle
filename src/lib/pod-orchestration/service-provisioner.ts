import { GVisorRuntime } from "./container-runtime";
import {
  getAllServiceTemplates,
  getServiceTemplateUnsafe,
  type ServiceTemplate,
} from "./service-registry";
import type { PodSpec, ServerConnection, ServiceConfig } from "./types";

export class ServiceProvisioner {
  private podId: string;
  private containerRuntime: GVisorRuntime;

  constructor(podId: string, serverConnection: ServerConnection) {
    this.podId = podId;
    this.containerRuntime = new GVisorRuntime(serverConnection);
  }

  async provisionService(spec: PodSpec, service: ServiceConfig): Promise<void> {
    const template = getServiceTemplateUnsafe(service.name);

    if (!template) {
      throw new Error(`Service template ${service.name} not found`);
    }

    try {
      console.log(
        `[ServiceProvisioner] Provisioning service ${service.name} for pod ${this.podId}`,
      );

      const container =
        await this.containerRuntime.getActiveContainerForPodOrThrow(this.podId);

      // Install service if template exists
      if (template) {
        console.log(
          `[ServiceProvisioner] Installing ${service.name} using template`,
        );
        // Run installation commands
        const installCommands = Array.isArray(template.installScript)
          ? template.installScript
          : template.installScript(spec);
        for (const installCmd of installCommands) {
          await this.containerRuntime.execInContainer(
            this.podId,
            container.id,
            ["sh", "-c", installCmd],
          );
        }

        // Create OpenRC service script with custom working directory if GitHub repo is present
        await this.createServiceScript(
          spec,
          container.id,
          service.name,
          template,
        );
      } else {
        // Custom service with commands
        console.log(
          `[ServiceProvisioner] Custom service ${service.name} with custom commands`,
        );
        if (service.command && service.command.length > 0) {
          // Install any dependencies specified in the command
          await this.containerRuntime.execInContainer(
            this.podId,
            container.id,
            service.command,
          );
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

  async startService({
    spec,
    podId,
    serviceName,
  }: {
    spec: PodSpec;
    podId: string;
    serviceName: string;
  }): Promise<void> {
    const container =
      await this.containerRuntime.getActiveContainerForPodOrThrow(podId);

    try {
      console.log(
        `[ServiceProvisioner] Starting service ${serviceName} for pod ${podId}`,
      );

      // Start using OpenRC
      try {
        await this.containerRuntime.execInContainer(podId, container.id, [
          "rc-service",
          serviceName,
          "start",
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("has already been started")) {
          console.log(
            `[ServiceProvisioner] Service is ${serviceName} already running`,
          );
        } else {
          throw error;
        }
      }

      // Wait a moment for service to start
      const template = getServiceTemplateUnsafe(serviceName);
      const delay = template?.healthCheckStartDelay
        ? template.healthCheckStartDelay! * 1000
        : 2000;
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Verify service is running
      const isHealthy = await this.checkServiceHealth(
        podId,
        serviceName,
        30_000,
      );
      if (!isHealthy) {
        throw new Error(
          `Service ${serviceName} failed health check after start`,
        );
      }

      console.log(
        `[ServiceProvisioner] Successfully started service ${serviceName}`,
      );

      if (template?.postStartScript) {
        console.log(
          `[ServiceProvisioner] Running post-start script for ${serviceName}`,
        );
        const postStartCommands = Array.isArray(template.postStartScript)
          ? template.postStartScript
          : template.postStartScript(spec);
        for (const postStartCmd of postStartCommands) {
          await this.containerRuntime.execInContainer(
            this.podId,
            container.id,
            ["sh", "-c", postStartCmd],
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ServiceProvisioner] Failed to start service ${serviceName}: ${message}`,
      );
      throw new Error(`Service start failed: ${message}`);
    }
  }

  async stopService(podId: string, serviceName: string): Promise<void> {
    const container =
      await this.containerRuntime.getActiveContainerForPodOrThrow(podId);

    try {
      console.log(
        `[ServiceProvisioner] Stopping service ${serviceName} for pod ${podId}`,
      );

      // Stop using OpenRC
      await this.containerRuntime.execInContainer(podId, container.id, [
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
    const container =
      await this.containerRuntime.getActiveContainerForPodOrThrow(podId);

    try {
      console.log(
        `[ServiceProvisioner] Removing service ${serviceName} for pod ${podId}`,
      );

      // Stop service first
      await this.stopService(podId, serviceName);

      // Remove service files and configurations
      await this.containerRuntime.execInContainer(podId, container.id, [
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
    serviceName: string,
  ): Promise<"running" | "stopped" | "failed"> {
    const container =
      await this.containerRuntime.getActiveContainerForPodOrThrow(this.podId);

    try {
      // Check using OpenRC
      const { stdout } = await this.containerRuntime.execInContainer(
        this.podId,
        container.id,
        ["rc-service", serviceName, "status"],
      );

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
    serviceName: string,
    options: { tail?: number } = {},
  ): Promise<string> {
    const container =
      await this.containerRuntime.getActiveContainerForPodOrThrow(this.podId);

    try {
      const tailOption = options.tail ? ` | tail -${options.tail}` : "";
      const { stdout } = await this.containerRuntime.execInContainer(
        this.podId,
        container.id,
        [
          "sh",
          "-c",
          `cat /tmp/${serviceName}.log 2>/dev/null${tailOption} || echo "No logs available"`,
        ],
      );

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
    const container =
      await this.containerRuntime.getActiveContainerForPodOrThrow(podId);

    if (!template) {
      // For custom services, just check if they're running
      const status = await this.getServiceStatus(serviceName);
      return status === "running";
    }

    const startTime = Date.now();
    let retries = 0;
    while (true) {
      try {
        // Run health check command
        const healthCmd = template.healthCheckCommand.join(" ");
        await this.containerRuntime.execInContainer(podId, container.id, [
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
    spec: PodSpec,
    containerId: string,
    serviceName: string,
    template: ServiceTemplate,
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

    // Get the start command from the template function
    const startCommandArray = template.startCommand(spec);
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

    await this.containerRuntime.execInContainer(this.podId, containerId, [
      "sh",
      "-c",
      writeScriptCommand,
    ]);
  }

  // Utility methods
  getAvailableServices(): string[] {
    return getAllServiceTemplates().map((t) => t.name);
  }

  getServiceTemplateInfo(serviceName: string): ServiceTemplate | undefined {
    return getServiceTemplateUnsafe(serviceName);
  }

  async listRunningServices(): Promise<string[]> {
    const runningServices: string[] = [];

    for (const template of getAllServiceTemplates()) {
      const status = await this.getServiceStatus(template.name);
      if (status === "running") {
        runningServices.push(template.name);
      }
    }

    return runningServices;
  }
}
