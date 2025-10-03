import { exec } from "node:child_process";
import { cpus, freemem, totalmem } from "node:os";
import { promisify } from "node:util";
import type { PodMetrics, ServerMetrics } from "./types.js";

const execAsync = promisify(exec);

export class MetricsCollector {
  private previousCpuUsage: { idle: number; total: number } | null = null;

  /**
   * Collect current system metrics including per-pod metrics
   */
  async collect(): Promise<ServerMetrics> {
    const [cpuUsagePercent, memoryUsageMb, diskUsageGb, podMetrics] =
      await Promise.all([
        this.getCpuUsage(),
        this.getMemoryUsage(),
        this.getDiskUsage(),
        this.getPodMetrics(),
      ]);

    return {
      cpuUsagePercent,
      memoryUsageMb,
      diskUsageGb,
      activePodsCount: podMetrics.length,
      podMetrics,
    };
  }

  /**
   * Get CPU usage percentage (0-100)
   */
  private async getCpuUsage(): Promise<number> {
    const cpusData = cpus();

    let idle = 0;
    let total = 0;

    for (const cpu of cpusData) {
      for (const type in cpu.times) {
        total += cpu.times[type as keyof typeof cpu.times];
      }
      idle += cpu.times.idle;
    }

    if (this.previousCpuUsage) {
      const idleDelta = idle - this.previousCpuUsage.idle;
      const totalDelta = total - this.previousCpuUsage.total;
      const usage = 100 - (100 * idleDelta) / totalDelta;

      this.previousCpuUsage = { idle, total };
      return Math.round(Math.max(0, Math.min(100, usage)));
    }

    // First call, just store for next time
    this.previousCpuUsage = { idle, total };
    return 0;
  }

  /**
   * Get memory usage in MB
   */
  private async getMemoryUsage(): Promise<number> {
    const totalMemory = totalmem();
    const freeMemory = freemem();
    const usedMemory = totalMemory - freeMemory;

    return Math.round(usedMemory / 1024 / 1024); // Convert to MB
  }

  /**
   * Get total disk usage in GB across all real filesystems (deduplicated)
   */
  private async getDiskUsage(): Promise<number> {
    try {
      // Get all real disk filesystems, deduplicate by device, sum used space
      // Use -P for POSIX format (single line per filesystem)
      // Filter only /dev/ devices to exclude tmpfs, shm, etc.
      // Redirect stderr to ignore permission denied errors
      const { stdout } = await execAsync(
        "df -Pk 2>/dev/null | awk '$1 ~ /^\\/dev\\// {fs[$1]=$3} END {total=0; for (f in fs) total+=fs[f]; print total}'",
      );
      const usedKb = parseInt(stdout.trim(), 10);
      return usedKb / 1024 / 1024; // Convert KB to GB
    } catch (error) {
      console.error("Failed to get disk usage:", error);
      return 0;
    }
  }

  /**
   * Get metrics for all running pods (Docker containers)
   */
  private async getPodMetrics(): Promise<PodMetrics[]> {
    try {
      // Get list of running containers with their IDs
      const { stdout: containerList } = await execAsync(
        "docker ps --filter status=running --format '{{.ID}}'",
      );

      const containerIds = containerList.trim().split("\n").filter(Boolean);

      if (containerIds.length === 0) {
        return [];
      }

      // Get stats for all containers in one shot (no-stream for single snapshot)
      const { stdout: statsOutput } = await execAsync(
        `docker stats --no-stream --format '{{.Container}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}' ${containerIds.join(" ")}`,
      );

      const podMetrics: PodMetrics[] = [];

      for (const line of statsOutput.trim().split("\n")) {
        if (!line) continue;

        const [containerId, cpuPerc, memUsage, netIO] = line.split("|");

        // Parse CPU: "15.23%" -> 15
        const cpuUsagePercent = Math.round(
          parseFloat(cpuPerc.replace("%", "")) || 0,
        );

        // Parse Memory: "123.4MiB / 512MiB" -> 123
        const memMatch = memUsage.match(/([0-9.]+)(MiB|GiB)/);
        let memoryUsageMb = 0;
        if (memMatch) {
          const value = parseFloat(memMatch[1]);
          memoryUsageMb =
            memMatch[2] === "GiB" ? Math.round(value * 1024) : Math.round(value);
        }

        // Parse Network: "1.2kB / 3.4kB" -> rx: 1200, tx: 3400
        const netMatch = netIO.match(
          /([0-9.]+)(B|kB|MB|GB)\s*\/\s*([0-9.]+)(B|kB|MB|GB)/,
        );
        let networkRxBytes = 0;
        let networkTxBytes = 0;
        if (netMatch) {
          networkRxBytes = this.parseNetworkBytes(netMatch[1], netMatch[2]);
          networkTxBytes = this.parseNetworkBytes(netMatch[3], netMatch[4]);
        }

        // Get container name to extract pod ID
        const { stdout: nameOutput } = await execAsync(
          `docker inspect ${containerId} --format '{{.Name}}'`,
        );

        // Extract pod ID from container name: "/pinacle-pod-{podId}" -> podId
        const containerName = nameOutput.trim();
        const podIdMatch = containerName.match(/pinacle-pod-(.+)/);
        const podId = podIdMatch ? podIdMatch[1] : containerId;

        // Get disk usage for this container
        const diskUsageMb = await this.getContainerDiskUsage(containerId);

        podMetrics.push({
          podId,
          containerId,
          cpuUsagePercent,
          memoryUsageMb,
          diskUsageMb,
          networkRxBytes,
          networkTxBytes,
        });
      }

      return podMetrics;
    } catch (error) {
      console.error("Failed to get pod metrics:", error);
      return [];
    }
  }

  /**
   * Parse network bytes from docker stats format
   */
  private parseNetworkBytes(value: string, unit: string): number {
    const num = parseFloat(value);
    switch (unit) {
      case "B":
        return Math.round(num);
      case "kB":
        return Math.round(num * 1024);
      case "MB":
        return Math.round(num * 1024 * 1024);
      case "GB":
        return Math.round(num * 1024 * 1024 * 1024);
      default:
        return 0;
    }
  }

  /**
   * Get disk usage for a specific container
   */
  private async getContainerDiskUsage(containerId: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `docker exec ${containerId} df -k / | tail -1 | awk '{print $3}'`,
      );
      const usedKb = parseInt(stdout.trim(), 10);
      return usedKb / 1024; // Convert KB to MB
    } catch {
      // Container might not have df command or exec might fail
      return 0;
    }
  }
}
