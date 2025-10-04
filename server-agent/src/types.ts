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
  apiUrl: string;
  apiKey: string;
  heartbeatIntervalMs: number;
};

