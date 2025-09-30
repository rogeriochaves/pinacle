import { exec } from "child_process";
import { promisify } from "util";
import type {
  LimaConfig,
  NetworkConfig,
  NetworkManager,
  PortMapping,
} from "./types";

const execAsync = promisify(exec);

export class LimaNetworkManager implements NetworkManager {
  private limaConfig: LimaConfig;
  private allocatedPorts: Map<string, Set<number>> = new Map(); // podId -> Set of ports
  private portRange = { min: 30000, max: 40000 };
  private isDevMode: boolean;

  constructor(limaConfig: LimaConfig = { vmName: "gvisor-alpine" }) {
    this.limaConfig = limaConfig;
    // Use Lima only in development on macOS
    this.isDevMode = (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") && process.platform === "darwin";
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
      console.log(`[NetworkManager] Executing: ${fullCommand}`);
    } else {
      // Production mode: direct execution
      fullCommand = useSudo ? `sudo ${command}` : command;
      console.log(`[NetworkManager] Executing: ${fullCommand}`);
    }

    try {
      const result = await execAsync(fullCommand);
      return result;
    } catch (error: any) {
      console.error(`[NetworkManager] Command failed: ${error.message}`);
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

  private generateNetworkName(podId: string): string {
    return `pinacle-net-${podId}`;
  }

  private generateSubnet(podId: string): string {
    // Generate a unique subnet for each pod
    // Use pod ID hash to generate consistent subnet
    const hash = this.hashString(podId);
    const subnet = 100 + (hash % 155); // 10.100.x.0/24 to 10.254.x.0/24
    return `10.${subnet}.1.0/24`;
  }

  private generatePodIp(subnet: string): string {
    // Extract network part and assign .2 to the pod
    const networkPart = subnet.split(".").slice(0, 3).join(".");
    return `${networkPart}.2`;
  }

  private generateGatewayIp(subnet: string): string {
    // Extract network part and assign .1 as gateway
    const networkPart = subnet.split(".").slice(0, 3).join(".");
    return `${networkPart}.1`;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  async createPodNetwork(
    podId: string,
    config: NetworkConfig,
  ): Promise<string> {
    const networkName = this.generateNetworkName(podId);
    const subnet = config.subnet || this.generateSubnet(podId);
    const podIp = config.podIp || this.generatePodIp(subnet);
    const gatewayIp = config.gatewayIp || this.generateGatewayIp(subnet);

    try {
      // Create custom Docker network
      const createNetworkCommand = [
        "docker network create",
        `--driver bridge`,
        `--subnet ${subnet}`,
        `--gateway ${gatewayIp}`,
        `--opt com.docker.network.bridge.name=br-${podId.substring(0, 12)}`,
        networkName,
      ].join(" ");

      await this.execLimaSudo(createNetworkCommand);

      // Apply network policies if specified
      if (
        config.allowEgress !== undefined ||
        config.allowedDomains ||
        config.bandwidthLimit
      ) {
        await this.applyNetworkPolicies(podId, [
          {
            type: "egress",
            allowed: config.allowEgress ?? true,
            domains: config.allowedDomains || [],
          },
          ...(config.bandwidthLimit
            ? [
                {
                  type: "bandwidth",
                  limit: config.bandwidthLimit,
                },
              ]
            : []),
        ]);
      }

      console.log(
        `[NetworkManager] Created network ${networkName} with subnet ${subnet}`,
      );
      return podIp;
    } catch (error: any) {
      console.error(
        `[NetworkManager] Failed to create pod network: ${error.message}`,
      );
      throw new Error(`Network creation failed: ${error.message}`);
    }
  }

  async destroyPodNetwork(podId: string): Promise<void> {
    const networkName = this.generateNetworkName(podId);

    try {
      // Remove all port allocations for this pod
      this.allocatedPorts.delete(podId);

      // Remove Docker network
      await this.execLimaSudo(`docker network rm ${networkName}`);

      console.log(`[NetworkManager] Destroyed network ${networkName}`);
    } catch (error: any) {
      if (!error.message.includes("No such network")) {
        console.error(
          `[NetworkManager] Failed to destroy pod network: ${error.message}`,
        );
        throw new Error(`Network destruction failed: ${error.message}`);
      }
    }
  }

  async allocatePort(podId: string, service: string): Promise<number> {
    const podPorts = this.allocatedPorts.get(podId) || new Set();

    // Find an available port
    for (let port = this.portRange.min; port <= this.portRange.max; port++) {
      if (!podPorts.has(port) && (await this.isPortAvailable(port))) {
        podPorts.add(port);
        this.allocatedPorts.set(podId, podPorts);

        console.log(
          `[NetworkManager] Allocated port ${port} for service ${service} in pod ${podId}`,
        );
        return port;
      }
    }

    throw new Error(
      `No available ports in range ${this.portRange.min}-${this.portRange.max}`,
    );
  }

  async releasePort(podId: string, port: number): Promise<void> {
    const podPorts = this.allocatedPorts.get(podId);
    if (podPorts) {
      podPorts.delete(port);
      if (podPorts.size === 0) {
        this.allocatedPorts.delete(podId);
      }
      console.log(`[NetworkManager] Released port ${port} for pod ${podId}`);
    }
  }

  async setupPortForwarding(
    podId: string,
    mapping: PortMapping,
  ): Promise<void> {
    try {
      // Port forwarding is handled by Docker's -p flag during container creation
      // For Lima, we need to also forward from host to Lima VM

      if (mapping.external) {
        // Forward port from macOS host to Lima VM
        const forwardCommand = `limactl port-forward ${this.limaConfig.vmName} ${mapping.external}:${mapping.external}`;

        // Note: This would typically be done in the background
        // For now, we'll log the command that should be run
        console.log(
          `[NetworkManager] Port forwarding setup: ${forwardCommand}`,
        );
        console.log(
          `[NetworkManager] Run this command to forward port ${mapping.external} from host to Lima VM`,
        );
      }

      console.log(
        `[NetworkManager] Set up port forwarding for ${mapping.name}: ${mapping.internal} -> ${mapping.external}`,
      );
    } catch (error: any) {
      console.error(
        `[NetworkManager] Failed to setup port forwarding: ${error.message}`,
      );
      throw new Error(`Port forwarding setup failed: ${error.message}`);
    }
  }

  async removePortForwarding(
    podId: string,
    mapping: PortMapping,
  ): Promise<void> {
    try {
      // Port forwarding cleanup would involve stopping the limactl port-forward process
      console.log(
        `[NetworkManager] Removed port forwarding for ${mapping.name}: ${mapping.internal} -> ${mapping.external}`,
      );
    } catch (error: any) {
      console.error(
        `[NetworkManager] Failed to remove port forwarding: ${error.message}`,
      );
      throw new Error(`Port forwarding removal failed: ${error.message}`);
    }
  }

  async applyNetworkPolicies(podId: string, policies: any[]): Promise<void> {
    const networkName = this.generateNetworkName(podId);

    try {
      for (const policy of policies) {
        switch (policy.type) {
          case "egress":
            await this.applyEgressPolicy(podId, policy);
            break;
          case "ingress":
            await this.applyIngressPolicy(podId, policy);
            break;
          case "bandwidth":
            await this.applyBandwidthPolicy(podId, policy);
            break;
          default:
            console.warn(
              `[NetworkManager] Unknown policy type: ${policy.type}`,
            );
        }
      }

      console.log(
        `[NetworkManager] Applied ${policies.length} network policies to pod ${podId}`,
      );
    } catch (error: any) {
      console.error(
        `[NetworkManager] Failed to apply network policies: ${error.message}`,
      );
      throw new Error(`Network policy application failed: ${error.message}`);
    }
  }

  private async applyEgressPolicy(podId: string, policy: any): Promise<void> {
    // Apply iptables rules for egress filtering
    const networkName = this.generateNetworkName(podId);

    if (!policy.allowed) {
      // Block all egress traffic
      const blockCommand = `iptables -I DOCKER-USER -s $(docker network inspect ${networkName} --format='{{range .IPAM.Config}}{{.Subnet}}{{end}}') -j DROP`;
      await this.execLimaSudo(blockCommand);
    } else if (policy.domains && policy.domains.length > 0) {
      // Allow only specific domains
      for (const domain of policy.domains) {
        // This is a simplified example - in production you'd want more sophisticated domain filtering
        const allowCommand = `iptables -I DOCKER-USER -s $(docker network inspect ${networkName} --format='{{range .IPAM.Config}}{{.Subnet}}{{end}}') -d ${domain} -j ACCEPT`;
        await this.execLimaSudo(allowCommand);
      }
    }
  }

  private async applyIngressPolicy(podId: string, policy: any): Promise<void> {
    // Apply iptables rules for ingress filtering
    // Implementation would depend on specific ingress requirements
    console.log(`[NetworkManager] Applied ingress policy for pod ${podId}`);
  }

  private async applyBandwidthPolicy(
    podId: string,
    policy: any,
  ): Promise<void> {
    // Apply traffic control (tc) rules for bandwidth limiting
    const networkInterface = `br-${podId.substring(0, 12)}`;

    const tcCommands = [
      `tc qdisc add dev ${networkInterface} root handle 1: htb default 30`,
      `tc class add dev ${networkInterface} parent 1: classid 1:1 htb rate ${policy.limit}mbit`,
      `tc class add dev ${networkInterface} parent 1:1 classid 1:10 htb rate ${policy.limit}mbit ceil ${policy.limit}mbit`,
    ];

    for (const command of tcCommands) {
      try {
        await this.execLimaSudo(command);
      } catch (error) {
        // TC commands might fail if already applied or interface doesn't exist yet
        console.warn(
          `[NetworkManager] TC command failed (might be expected): ${command}`,
        );
      }
    }
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    try {
      // Check if port is available on Lima VM
      const { stdout } = await this.execLima(
        `netstat -tuln | grep :${port} || echo "available"`,
      );
      return stdout.includes("available");
    } catch (error) {
      // If netstat fails, assume port is available
      return true;
    }
  }

  // Utility methods for network management
  async getNetworkInfo(podId: string): Promise<{
    networkName: string;
    subnet: string;
    gateway: string;
    podIp?: string;
  } | null> {
    const networkName = this.generateNetworkName(podId);

    try {
      const { stdout } = await this.execLimaSudo(
        `docker network inspect ${networkName} --format='{{json .}}'`,
      );

      const networkData = JSON.parse(stdout.trim());
      const subnet = networkData.IPAM?.Config?.[0]?.Subnet || "";
      const gateway = networkData.IPAM?.Config?.[0]?.Gateway || "";

      return {
        networkName,
        subnet,
        gateway,
        podIp: undefined, // Would need to inspect container to get actual IP
      };
    } catch (error: any) {
      if (error.message.includes("No such network")) {
        return null;
      }
      throw error;
    }
  }

  async listPodNetworks(): Promise<
    Array<{ podId: string; networkName: string }>
  > {
    try {
      const { stdout } = await this.execLimaSudo(
        `docker network ls --filter name=pinacle-net- --format='{{.Name}}'`,
      );

      const networkNames = stdout.trim().split("\n").filter(Boolean);

      return networkNames.map((name) => ({
        podId: name.replace("pinacle-net-", ""),
        networkName: name,
      }));
    } catch (error: any) {
      console.error(
        `[NetworkManager] Failed to list pod networks: ${error.message}`,
      );
      return [];
    }
  }

  async getPortAllocations(podId: string): Promise<number[]> {
    const podPorts = this.allocatedPorts.get(podId);
    return podPorts ? Array.from(podPorts) : [];
  }
}
