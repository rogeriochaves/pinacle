export type ServerInfo = {
  id?: string;
  hostname: string;
  ipAddress: string;
  cpuCores: number;
  memoryMb: number;
  diskGb: number;
  sshHost: string;
  sshPort: number;
  sshUser: string;
};

export type PodMetrics = {
  podId: string;
  containerId: string;
  cpuUsagePercent: number;
  memoryUsageMb: number;
  diskUsageMb: number;
  networkRxBytes: number;
  networkTxBytes: number;
};

export type ServerMetrics = {
  cpuUsagePercent: number;
  memoryUsageMb: number;
  diskUsageGb: number;
  activePodsCount: number;
  podMetrics: PodMetrics[];
};

export type AgentConfig = {
  serverId?: string;
  apiUrl: string; // Production URL (always used)
  devApiUrl?: string; // Optional dev URL (e.g., cloudflared tunnel)
  apiKey: string; // API key for production URL
  devApiKey?: string; // API key for dev URL (if different)
  heartbeatIntervalMs: number;
};

