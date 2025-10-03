import type { ServerMetrics } from "./types.js";
export declare class MetricsCollector {
    private previousCpuUsage;
    /**
     * Collect current system metrics including per-pod metrics
     */
    collect(): Promise<ServerMetrics>;
    /**
     * Get CPU usage percentage (0-100)
     */
    private getCpuUsage;
    /**
     * Get memory usage in MB
     */
    private getMemoryUsage;
    /**
     * Get total disk usage in GB across all real filesystems (deduplicated)
     */
    private getDiskUsage;
    /**
     * Get metrics for all running pods (Docker containers)
     */
    private getPodMetrics;
    /**
     * Parse network bytes from docker stats format
     */
    private parseNetworkBytes;
    /**
     * Get disk usage for a specific container
     */
    private getContainerDiskUsage;
}
//# sourceMappingURL=metrics-collector.d.ts.map