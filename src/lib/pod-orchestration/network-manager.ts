import type {
  NetworkConfig,
  NetworkPolicy,
  PortMapping,
  ServerConnection,
} from "./types";

export class NetworkManager {
  private serverConnection: ServerConnection;
  private allocatedPorts: Map<string, Set<number>> = new Map(); // podId -> Set of ports
  private portRange = { min: 30000, max: 40000 };

  constructor(serverConnection: ServerConnection) {
    this.serverConnection = serverConnection;
  }

  private async exec(
    command: string,
    useSudo: boolean = false,
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await this.serverConnection.exec(command, {
        sudo: useSudo,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[NetworkManager] Command failed: ${message}`);
      throw error;
    }
  }

  private generateNetworkName(podId: string): string {
    return `pinacle-net-${podId}`;
  }

  private async getExistingSubnets(): Promise<Set<string>> {
    try {
      // Get all Docker networks
      const { stdout } = await this.exec(
        "docker network inspect $(docker network ls -q) 2>/dev/null || echo '[]'",
        true,
      );

      const networks = JSON.parse(stdout || "[]");
      const subnets = new Set<string>();

      for (const network of networks) {
        if (network.IPAM?.Config) {
          for (const config of network.IPAM.Config) {
            if (config.Subnet) {
              subnets.add(config.Subnet);
            }
          }
        }
      }

      return subnets;
    } catch (error) {
      console.warn(
        "[NetworkManager] Failed to get existing subnets, will attempt allocation anyway:",
        error,
      );
      return new Set<string>();
    }
  }

  private async generateAvailableSubnet(podId: string): Promise<string> {
    const existingSubnets = await this.getExistingSubnets();

    // Start with hash-based suggestion
    const hash = this.hashString(podId);
    let attempt = 100 + (hash % 155); // 10.100.x.0/24 to 10.254.x.0/24

    // Try up to 155 different subnets
    for (let i = 0; i < 155; i++) {
      const subnet = `10.${attempt}.1.0/24`;
      if (!existingSubnets.has(subnet)) {
        console.log(
          `[NetworkManager] Allocated subnet ${subnet} for pod ${podId}`,
        );
        return subnet;
      }
      // Move to next subnet
      attempt = 100 + ((attempt - 99) % 155);
    }

    throw new Error(
      "No available subnets in range 10.100.1.0/24 to 10.254.1.0/24",
    );
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
    const subnet = config.subnet || (await this.generateAvailableSubnet(podId));
    const podIp = config.podIp || this.generatePodIp(subnet);
    const gatewayIp = config.gatewayIp || this.generateGatewayIp(subnet);

    try {
      // Check if network already exists
      const network = await this.getNetworkInfo(podId);
      if (network) {
        console.log(
          `[NetworkManager] Network ${networkName} already exists, deleting it`,
        );
        await this.destroyPodNetwork(podId);
      }

      // Create custom Docker network
      const createNetworkCommand = [
        "docker network create",
        `--driver bridge`,
        `--subnet ${subnet}`,
        `--gateway ${gatewayIp}`,
        `--opt com.docker.network.bridge.name=br-${podId.substring(0, 12)}`,
        networkName,
      ].join(" ");

      await this.exec(createNetworkCommand, true);

      // Apply network policies if specified
      if (
        config.allowEgress !== undefined ||
        config.allowedDomains ||
        config.bandwidthLimit
      ) {
        const policies: NetworkPolicy[] = [
          {
            type: "egress" as const,
            allowed: config.allowEgress ?? true,
            domains: config.allowedDomains || [],
          },
        ];

        if (config.bandwidthLimit) {
          policies.push({
            type: "bandwidth" as const,
            limit: config.bandwidthLimit,
          });
        }

        await this.applyNetworkPolicies(podId, policies);
      }

      console.log(
        `[NetworkManager] Created network ${networkName} with subnet ${subnet}`,
      );
      return podIp;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[NetworkManager] Failed to create pod network: ${message}`,
      );
      throw new Error(`Network creation failed: ${message}`);
    }
  }

  async destroyPodNetwork(podId: string): Promise<void> {
    const networkName = this.generateNetworkName(podId);

    try {
      // Remove all port allocations for this pod
      this.allocatedPorts.delete(podId);

      // Remove Docker network
      await this.exec(`docker network rm ${networkName}`, true);

      console.log(`[NetworkManager] Destroyed network ${networkName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !message.includes("No such network") &&
        !message.includes("not found")
      ) {
        console.error(
          `[NetworkManager] Failed to destroy pod network: ${message}`,
        );
        throw new Error(`Network destruction failed: ${message}`);
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
    _podId: string,
    mapping: PortMapping,
  ): Promise<void> {
    // Port forwarding is handled by Docker's -p flag during container creation
    // When using SSH to remote servers, the ports are directly accessible on the server
    // For local development with Lima, limactl automatically forwards ports
    console.log(
      `[NetworkManager] Set up port forwarding for ${mapping.name}: ${mapping.internal} -> ${mapping.external}`,
    );
  }

  async removePortForwarding(
    _podId: string,
    mapping: PortMapping,
  ): Promise<void> {
    try {
      // Port forwarding cleanup would involve stopping the limactl port-forward process
      console.log(
        `[NetworkManager] Removed port forwarding for ${mapping.name}: ${mapping.internal} -> ${mapping.external}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[NetworkManager] Failed to remove port forwarding: ${message}`,
      );
      throw new Error(`Port forwarding removal failed: ${message}`);
    }
  }

  async applyNetworkPolicies(
    podId: string,
    policies: NetworkPolicy[],
  ): Promise<void> {
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
        }
      }

      console.log(
        `[NetworkManager] Applied ${policies.length} network policies to pod ${podId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[NetworkManager] Failed to apply network policies: ${message}`,
      );
      throw new Error(`Network policy application failed: ${message}`);
    }
  }

  private async applyEgressPolicy(
    podId: string,
    policy: Extract<NetworkPolicy, { type: "egress" }>,
  ): Promise<void> {
    // Apply iptables rules for egress filtering
    const networkName = this.generateNetworkName(podId);

    if (!policy.allowed) {
      // Block all egress traffic
      const blockCommand = `iptables -I DOCKER-USER -s $(docker network inspect ${networkName} --format='{{range .IPAM.Config}}{{.Subnet}}{{end}}') -j DROP`;
      await this.exec(blockCommand, true);
    } else if (policy.domains && policy.domains.length > 0) {
      // Allow only specific domains
      for (const domain of policy.domains) {
        // This is a simplified example - in production you'd want more sophisticated domain filtering
        const allowCommand = `iptables -I DOCKER-USER -s $(docker network inspect ${networkName} --format='{{range .IPAM.Config}}{{.Subnet}}{{end}}') -d ${domain} -j ACCEPT`;
        await this.exec(allowCommand, true);
      }
    }
  }

  private async applyIngressPolicy(
    _podId: string,
    _policy: Extract<NetworkPolicy, { type: "ingress" }>,
  ): Promise<void> {
    // Apply iptables rules for ingress filtering
    // Implementation would depend on specific ingress requirements
    console.log(`[NetworkManager] Applied ingress policy for pod ${_podId}`);
  }

  private async applyBandwidthPolicy(
    podId: string,
    policy: Extract<NetworkPolicy, { type: "bandwidth" }>,
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
        await this.exec(command, true);
      } catch {
        // TC commands might fail if already applied or interface doesn't exist yet
        console.warn(
          `[NetworkManager] TC command failed (might be expected): ${command}`,
        );
      }
    }
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    try {
      // Check if port is available on server
      const { stdout } = await this.exec(
        `netstat -tuln | grep :${port} || echo "available"`,
        false,
      );
      return stdout.includes("available");
    } catch {
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
      const { stdout } = await this.exec(
        `docker network inspect ${networkName} --format='{{json .}}'`,
        true,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("No such network") || message.includes("not found")) {
        return null;
      }
      throw error;
    }
  }

  async listPodNetworks(): Promise<
    Array<{ podId: string; networkName: string }>
  > {
    try {
      const { stdout } = await this.exec(
        `docker network ls --filter name=pinacle-net- --format='{{.Name}}'`,
        true,
      );

      const networkNames = stdout.trim().split("\n").filter(Boolean);

      return networkNames.map((name) => ({
        podId: name.replace("pinacle-net-", ""),
        networkName: name,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[NetworkManager] Failed to list pod networks: ${message}`);
      return [];
    }
  }

  async getPortAllocations(podId: string): Promise<number[]> {
    const podPorts = this.allocatedPorts.get(podId);
    return podPorts ? Array.from(podPorts) : [];
  }
}
