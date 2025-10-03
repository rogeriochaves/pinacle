import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, hostname, networkInterfaces, totalmem } from "node:os";
import { resolve } from "node:path";
import { config } from "dotenv";
import { MetricsCollector } from "./metrics-collector.js";
import type { AgentConfig, ServerInfo } from "./types.js";

// Load environment variables
config();

const CONFIG_FILE = resolve(process.cwd(), ".server-config.json");

export class ServerAgent {
  private config: AgentConfig;
  private metricsCollector: MetricsCollector;
  private serverId?: string;
  private intervalId?: NodeJS.Timeout;

  constructor() {
    this.config = {
      apiUrl: process.env.API_URL || "http://localhost:3000",
      apiKey: process.env.API_KEY || "",
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
   */
  private async registerServer(): Promise<void> {
    const serverInfo = await this.getServerInfo();

    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/trpc/servers.registerServer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.config.apiKey,
          },
          body: JSON.stringify({
            json: {
              hostname: serverInfo.hostname,
              ipAddress: serverInfo.ipAddress,
              cpuCores: serverInfo.cpuCores,
              memoryMb: serverInfo.memoryMb,
              diskGb: serverInfo.diskGb,
            },
          }),
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
      console.error("❌ Failed to register server:", error);
      throw error;
    }
  }

  /**
   * Send heartbeat and metrics to main server
   */
  private async sendHeartbeatAndMetrics(): Promise<void> {
    if (!this.serverId) {
      console.warn("⚠️  No server ID, skipping heartbeat");
      return;
    }

    try {
      // Collect metrics
      const metrics = await this.metricsCollector.collect();

      // Send heartbeat
      const heartbeatResponse = await fetch(
        `${this.config.apiUrl}/api/trpc/servers.heartbeat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.config.apiKey,
          },
          body: JSON.stringify({
            json: {
              serverId: this.serverId,
            },
          }),
        },
      );

      if (!heartbeatResponse.ok) {
        throw new Error(
          `Heartbeat failed: ${heartbeatResponse.status} ${await heartbeatResponse.text()}`,
        );
      }

      const json = {
        serverId: this.serverId,
        cpuUsagePercent: metrics.cpuUsagePercent,
        memoryUsageMb: metrics.memoryUsageMb,
        diskUsageGb: metrics.diskUsageGb,
        activePodsCount: metrics.activePodsCount,
        podMetrics: metrics.podMetrics,
      }
      console.log('json', json);

      // Send metrics
      const metricsResponse = await fetch(
        `${this.config.apiUrl}/api/trpc/servers.reportMetrics`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.config.apiKey,
          },
          body: JSON.stringify({
            json: {
              serverId: this.serverId,
              cpuUsagePercent: metrics.cpuUsagePercent,
              memoryUsageMb: metrics.memoryUsageMb,
              diskUsageGb: metrics.diskUsageGb,
              activePodsCount: metrics.activePodsCount,
              podMetrics: metrics.podMetrics,
            },
          }),
        },
      );

      if (!metricsResponse.ok) {
        const errorText = await metricsResponse.text();
        throw new Error(
          `Metrics report failed: ${metricsResponse.status}\n${errorText.replace("\\n", "\n")}`,
        );
      }

      console.log(
        `💓 Heartbeat sent | CPU: ${metrics.cpuUsagePercent}% | Memory: ${metrics.memoryUsageMb}MB | Pods: ${metrics.activePodsCount}`,
      );

      if (metrics.podMetrics.length > 0) {
        console.log(
          `📊 Pod metrics: ${metrics.podMetrics.map((pm) => `${pm.podId.substring(0, 8)}:${pm.cpuUsagePercent}%`).join(", ")}`,
        );
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
      diskGb = totalKb / 1024 / 1024; // Convert KB to GB
    } catch {
      console.warn("⚠️  Could not determine disk size, using default 100GB");
    }

    return {
      hostname: hostname(),
      ipAddress,
      cpuCores: cpuCount,
      memoryMb: totalMemoryMb,
      diskGb,
    };
  }

  /**
   * Load server configuration from file
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
      }
    }
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
