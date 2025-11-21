import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, hostname, networkInterfaces, totalmem } from "node:os";
import { resolve } from "node:path";
import { config } from "dotenv";
import KSUID from "ksuid";
import { MetricsCollector } from "./metrics-collector.js";
import type { AgentConfig, ServerInfo } from "./types.js";

// Load environment variables
config();

const CONFIG_FILE = resolve(process.cwd(), ".server-config.json");

export class ServerAgent {
  private config: AgentConfig;
  private metricsCollector: MetricsCollector;
  private serverId!: string; // Stable server ID generated on first run (initialized in loadServerConfig)
  private intervalId?: NodeJS.Timeout;

  constructor() {
    this.config = {
      apiUrl: process.env.API_URL || "http://localhost:3000",
      devApiUrl: process.env.DEV_API_URL, // Optional dev/cloudflared tunnel URL
      apiKey: process.env.API_KEY || "",
      devApiKey: process.env.DEV_API_KEY, // Optional separate API key for dev URL
      heartbeatIntervalMs: parseInt(
        process.env.HEARTBEAT_INTERVAL_MS || "30000",
        10,
      ),
    };

    this.metricsCollector = new MetricsCollector();

    // Load server ID from config file if exists
    this.loadServerConfig();
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    console.log("🚀 Starting Pinacle Server Agent...");
    console.log(`   API URL: ${this.config.apiUrl}`);
    if (this.config.devApiUrl) {
      console.log(`   Dev API URL: ${this.config.devApiUrl} 🔧`);
    }
    console.log(
      `   Heartbeat interval: ${this.config.heartbeatIntervalMs / 1000}s`,
    );

    // Register server if not already registered
    if (!this.serverId) {
      console.log("📝 Server not registered, registering now...");
      await this.registerServer();
    } else {
      console.log(`✅ Server ID: ${this.serverId}`);
    }

    // Start heartbeat and metrics loop
    console.log("💓 Starting heartbeat loop...");
    await this.sendHeartbeatAndMetrics(); // Send immediately

    this.intervalId = setInterval(async () => {
      try {
        await this.sendHeartbeatAndMetrics();
      } catch (error) {
        console.error("❌ Error in heartbeat loop:", error);
      }
    }, this.config.heartbeatIntervalMs);

    console.log("✅ Server agent started successfully!");
  }

  /**
   * Stop the agent
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    console.log("🛑 Server agent stopped");
  }

  /**
   * Register this server with the main application
   * Registers with both production and dev URLs if dev URL is configured
   * Uses the stable server ID to ensure consistent identity across environments
   */
  private async registerServer(): Promise<void> {
    const serverInfo = await this.getServerInfo();

    const registerPayload = {
      json: {
        id: this.serverId, // Include stable server ID
        hostname: serverInfo.hostname,
        ipAddress: serverInfo.ipAddress,
        cpuCores: serverInfo.cpuCores,
        memoryMb: serverInfo.memoryMb,
        diskGb: serverInfo.diskGb,
        sshHost: serverInfo.sshHost,
        sshPort: serverInfo.sshPort,
        sshUser: serverInfo.sshUser,
      },
    };

    // Register with production URL (primary)
    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/trpc/servers.registerServer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.config.apiKey,
          },
          body: JSON.stringify(registerPayload),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to register server: ${response.status} ${errorText}`,
        );
      }

      const data = (await response.json()) as {
        result: { data: { json: { id: string } } };
      };
      this.serverId = data.result.data.json.id;

      // Save server ID to config file
      this.saveServerConfig();

      console.log(`✅ Server registered successfully! ID: ${this.serverId}`);
    } catch (error) {
      console.error("❌ Failed to register server with production URL:", error);
      throw error;
    }

    // Also register with dev URL if configured
    if (this.config.devApiUrl) {
      await this.registerToDevUrl();
    }
  }

  /**
   * Register server specifically to the dev URL
   * This is called when the dev URL returns 404 for metrics
   * Uses the same stable server ID as production registration
   */
  private async registerToDevUrl(): Promise<void> {
    if (!this.config.devApiUrl) {
      return;
    }

    const serverInfo = await this.getServerInfo();

    const registerPayload = {
      json: {
        id: this.serverId, // Use same stable server ID
        hostname: serverInfo.hostname,
        ipAddress: serverInfo.ipAddress,
        cpuCores: serverInfo.cpuCores,
        memoryMb: serverInfo.memoryMb,
        diskGb: serverInfo.diskGb,
        sshHost: serverInfo.sshHost,
        sshPort: serverInfo.sshPort,
        sshUser: serverInfo.sshUser,
      },
    };

    try {
      const response = await fetch(
        `${this.config.devApiUrl}/api/trpc/servers.registerServer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.config.devApiKey || this.config.apiKey,
          },
          body: JSON.stringify(registerPayload),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Dev URL registration failed: ${response.status}\n${errorText}`,
        );
      }

      console.log("✅ Server registered with dev URL");
    } catch (error) {
      console.warn("⚠️  Failed to register with dev URL:", error);
    }
  }

  /**
   * Send heartbeat and metrics to main server
   * Reports to both production and dev URLs if dev URL is configured
   */
  private async sendHeartbeatAndMetrics(): Promise<void> {
    if (!this.serverId) {
      console.warn("⚠️  No server ID, skipping heartbeat");
      return;
    }

    try {
      // Collect metrics
      const metrics = await this.metricsCollector.collect();

      const metricsPayload = {
        json: {
          serverId: this.serverId,
          cpuUsagePercent: metrics.cpuUsagePercent,
          memoryUsageMb: metrics.memoryUsageMb,
          diskUsageGb: metrics.diskUsageGb,
          activePodsCount: metrics.activePodsCount,
          podMetrics: metrics.podMetrics,
        },
      };

      // Send metrics to production URL (primary)
      const metricsResponse = await fetch(
        `${this.config.apiUrl}/api/trpc/servers.reportMetrics`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.config.apiKey,
          },
          body: JSON.stringify(metricsPayload),
        },
      );

      if (!metricsResponse.ok) {
        if (metricsResponse.status === 404) {
          console.warn("❌ Server not found, re-registering...");
          await this.registerServer();
          return;
        }

        const errorText = await metricsResponse.text();
        throw new Error(
          `Metrics report failed: ${metricsResponse.status}\n${errorText.replace("\\n", "\n")}`,
        );
      }

      console.log(
        `💓 Heartbeat sent | CPU: ${metrics.cpuUsagePercent}% | Memory: ${metrics.memoryUsageMb}MB | Pods: ${metrics.activePodsCount}`,
      );

      // Also send metrics to dev URL if configured
      if (this.config.devApiUrl) {
        try {
          const devMetricsResponse = await fetch(
            `${this.config.devApiUrl}/api/trpc/servers.reportMetrics`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": this.config.devApiKey || this.config.apiKey,
              },
              body: JSON.stringify(metricsPayload),
            },
          );

          // If server not found on dev URL, register it with the same stable ID
          if (!devMetricsResponse.ok && devMetricsResponse.status === 404) {
            console.warn(
              "⚠️  Server not found on dev URL, registering now...",
            );
            await this.registerToDevUrl();
          }
        } catch {
          // Dev URL is optional, so just log warning if it fails
          console.warn("⚠️  Failed to send metrics to dev URL (non-critical)");
        }
      }
    } catch (error) {
      console.error("❌ Failed to send heartbeat/metrics:", error);
    }
  }

  /**
   * Get server hardware information
   */
  private async getServerInfo(): Promise<ServerInfo> {
    // Get primary IP address
    const nets = networkInterfaces();
    let ipAddress = "127.0.0.1";

    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        // Skip internal and non-IPv4 addresses
        if (!net.internal && net.family === "IPv4") {
          ipAddress = net.address;
          break;
        }
      }
      if (ipAddress !== "127.0.0.1") break;
    }

    // Get CPU info
    const cpuCount = cpus().length;

    // Get total memory in MB
    const totalMemoryMb = Math.round(totalmem() / 1024 / 1024);

    // Get total disk size across all real filesystems (deduplicated)
    let diskGb = 100; // Default fallback
    try {
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);
      // Get all real disk filesystems, deduplicate by device, sum total size
      // Use -P for POSIX format (single line per filesystem)
      // Filter only /dev/ devices to exclude tmpfs, shm, etc.
      // Redirect stderr to ignore permission denied errors
      const { stdout } = await execAsync(
        "df -Pk 2>/dev/null | awk '$1 ~ /^\\/dev\\// {fs[$1]=$2} END {total=0; for (f in fs) total+=fs[f]; print total}'",
      );
      const totalKb = parseInt(stdout.trim(), 10);
      diskGb = parseFloat((totalKb / 1024 / 1024).toFixed(2)); // Convert KB to GB
    } catch {
      console.warn("⚠️  Could not determine disk size, using default 100GB");
    }

    // Get SSH connection details from environment
    const sshHost = process.env.SSH_HOST || ipAddress;
    const sshPort = parseInt(process.env.SSH_PORT || "22", 10);
    const sshUser = process.env.SSH_USER || "root";

    const serverInfo: ServerInfo = {
      hostname: hostname(),
      ipAddress,
      cpuCores: cpuCount,
      memoryMb: totalMemoryMb,
      diskGb,
      sshHost,
      sshPort,
      sshUser,
    };

    return serverInfo;
  }

  /**
   * Load server configuration from file
   * Generates a new stable server ID if config doesn't exist
   */
  private loadServerConfig(): void {
    if (existsSync(CONFIG_FILE)) {
      try {
        const configData = readFileSync(CONFIG_FILE, "utf-8");
        const config = JSON.parse(configData);
        this.serverId = config.serverId;
        console.log(`📁 Loaded server config: ${this.serverId}`);
      } catch (error) {
        console.warn("⚠️  Failed to load server config:", error);
        this.serverId = this.generateServerId();
        this.saveServerConfig();
      }
    } else {
      // First run - generate new stable server ID
      this.serverId = this.generateServerId();
      console.log(`🆔 Generated new server ID: ${this.serverId}`);
      this.saveServerConfig();
    }
  }

  /**
   * Generate a new server ID with "server_" prefix
   */
  private generateServerId(): string {
    const ksuid = KSUID.randomSync();
    return `server_${ksuid.string}`;
  }

  /**
   * Save server configuration to file
   */
  private saveServerConfig(): void {
    try {
      writeFileSync(
        CONFIG_FILE,
        JSON.stringify({ serverId: this.serverId }, null, 2),
        "utf-8",
      );
      console.log("💾 Server config saved");
    } catch (error) {
      console.error("❌ Failed to save server config:", error);
    }
  }
}

// Start the agent if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new ServerAgent();

  agent.start().catch((error) => {
    console.error("💥 Fatal error:", error);
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n👋 Shutting down gracefully...");
    agent.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n👋 Shutting down gracefully...");
    agent.stop();
    process.exit(0);
  });
}
