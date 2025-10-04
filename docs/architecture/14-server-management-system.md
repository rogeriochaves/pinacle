# Server Management & Monitoring System

## Overview

Pinacle's server management system enables horizontal scaling by managing multiple physical or virtual servers (hosts) where user pods are deployed. The system includes automatic server registration, real-time metrics collection, unified SSH abstraction, and comprehensive provisioning logs.

**Status**: ✅ **Fully Implemented and Tested**

## Architecture

```mermaid
graph TB
    subgraph "Main Pinacle App"
        API[tRPC API]
        DB[(PostgreSQL)]
        Worker[Background Worker]
    end

    subgraph "Server 1 (Production/Lima)"
        Agent1[Server Agent<br/>Node.js Service]
        Docker1[Docker + gVisor]
        Pods1[User Pods]
    end

    subgraph "Server 2 (Production)"
        Agent2[Server Agent<br/>Node.js Service]
        Docker2[Docker + gVisor]
        Pods2[User Pods]
    end

    subgraph "Server N"
        AgentN[Server Agent<br/>Node.js Service]
        DockerN[Docker + gVisor]
        PodsN[User Pods]
    end

    Agent1 -->|Self-Register| API
    Agent2 -->|Self-Register| API
    AgentN -->|Self-Register| API

    Agent1 -->|Metrics Every 5s| API
    Agent2 -->|Metrics Every 5s| API
    AgentN -->|Metrics Every 5s| API

    API -->|SSH Commands| Docker1
    API -->|SSH Commands| Docker2
    API -->|SSH Commands| DockerN

    Docker1 --> Pods1
    Docker2 --> Pods2
    DockerN --> PodsN

    Worker -->|Cleanup Old Metrics| DB
```

## Components

### 1. Server Agent

A lightweight Node.js service that runs on each server to handle self-registration and metrics reporting.

**Location**: `server-agent/`

#### Features
- **Self-Registration**: Automatically registers with main app on startup
- **System Metrics**: Reports CPU, memory, disk usage every 5 seconds
- **Per-Pod Metrics**: Collects resource usage for each Docker container
- **SSH Details**: Reports hostname, port, and user for SSH connectivity
- **Heartbeat**: Regular status updates to confirm server availability

#### Implementation

```typescript
// server-agent/src/index.ts
const MAIN_APP_URL = process.env.MAIN_APP_URL;
const SERVER_API_KEY = process.env.SERVER_API_KEY;
const INTERVAL = 5000; // 5 seconds

let serverId: string | null = null;

async function registerServer() {
  const serverInfo = {
    hostname: os.hostname(),
    ipAddress: getLocalIP(),
    cpuCores: os.cpus().length,
    totalRamGb: os.totalmem() / (1024 ** 3),
    totalDiskGb: await getDiskSpace(),
    sshHost: await getSshHost(),
    sshPort: await getSshPort(),
    sshUser: process.env.USER || 'root',
  };

  const response = await fetch(`${MAIN_APP_URL}/api/trpc/servers.registerServer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVER_API_KEY}`,
    },
    body: JSON.stringify({ json: serverInfo }),
  });

  const data = await response.json();
  serverId = data.result.data.json.id;
}

async function sendMetrics() {
  if (!serverId) return;

  const metrics = await collectMetrics();
  const podMetrics = await collectPodMetrics();

  await fetch(`${MAIN_APP_URL}/api/trpc/servers.reportMetrics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVER_API_KEY}`,
    },
    body: JSON.stringify({
      json: {
        serverId,
        ...metrics,
        podMetrics,
      }
    }),
  });
}

// Metrics collection
async function collectMetrics() {
  const cpuUsage = await getCpuUsage();
  const memInfo = process.memoryUsage();

  return {
    cpuUsagePercent: cpuUsage,
    ramUsageGb: memInfo.rss / (1024 ** 3),
    diskUsageGb: await getDiskUsage(),
    activePodsCount: await getActivePodCount(),
  };
}

async function collectPodMetrics() {
  const containers = await getDockerContainers();
  const metrics = [];

  for (const container of containers) {
    if (container.name.startsWith('pinacle-pod-')) {
      const podId = container.name.replace('pinacle-pod-', '');
      const stats = await getContainerStats(container.id);

      metrics.push({
        podId,
        cpuPercent: stats.cpu,
        memoryMb: stats.memory,
        diskMb: stats.disk,
        networkRxBytes: stats.networkRx,
        networkTxBytes: stats.networkTx,
      });
    }
  }

  return metrics;
}
```

#### Provisioning Script

**Location**: `scripts/provision-server.sh`

Automates server setup with:
- Node.js installation (via fnm)
- Docker and gVisor setup
- Server agent installation and configuration
- SSH key installation for main app access
- OpenRC service configuration for auto-start

```bash
#!/bin/bash
set -e

# Usage: ./provision-server.sh <server_ssh_string>
# Example: ./provision-server.sh user@server-ip

SERVER=$1
MAIN_APP_URL=${MAIN_APP_URL:-"http://localhost:3000"}
SERVER_API_KEY=${SERVER_API_KEY:-""}
SSH_PUBLIC_KEY=${SSH_PUBLIC_KEY:-""}

if [ -z "$SSH_PUBLIC_KEY" ]; then
  echo "Error: SSH_PUBLIC_KEY environment variable is required"
  exit 1
fi

echo "📦 Provisioning server: $SERVER"

# Install Node.js via fnm
ssh $SERVER << 'EOF'
  curl -fsSL https://fnm.vercel.app/install | bash
  source ~/.bashrc
  fnm install 20
  fnm use 20
EOF

# Copy and install server agent
tar czf /tmp/server-agent.tar.gz -C server-agent dist package.json
scp /tmp/server-agent.tar.gz $SERVER:/tmp/
ssh $SERVER << 'EOF'
  sudo mkdir -p /opt/pinacle/server-agent
  sudo tar xzf /tmp/server-agent.tar.gz -C /opt/pinacle/server-agent
  cd /opt/pinacle/server-agent
  pnpm install --prod
EOF

# Configure environment
ssh $SERVER << EOF
  sudo tee /opt/pinacle/server-agent/.env > /dev/null <<ENVEOF
MAIN_APP_URL=${MAIN_APP_URL}
SERVER_API_KEY=${SERVER_API_KEY}
NODE_ENV=production
ENVEOF
EOF

# Install SSH public key
ssh $SERVER << EOF
  mkdir -p ~/.ssh
  echo "${SSH_PUBLIC_KEY}" >> ~/.ssh/authorized_keys
  chmod 600 ~/.ssh/authorized_keys
EOF

# Setup OpenRC service
ssh $SERVER << 'EOF'
  sudo tee /etc/init.d/pinacle-agent > /dev/null <<'SERVICEEOF'
#!/sbin/openrc-run

name="pinacle-agent"
description="Pinacle Server Agent"
command="/root/.local/share/fnm/node-versions/v20.*/installation/bin/node"
command_args="/opt/pinacle/server-agent/dist/index.js"
command_background="yes"
pidfile="/run/pinacle-agent.pid"
directory="/opt/pinacle/server-agent"

depend() {
    need net
    after docker
}
SERVICEEOF

  sudo chmod +x /etc/init.d/pinacle-agent
  sudo rc-update add pinacle-agent default
  sudo rc-service pinacle-agent start
EOF

echo "✅ Server provisioned successfully!"
```

### 2. SSH Connection Abstraction

**Location**: `src/lib/pod-orchestration/server-connection.ts`

Provides a unified interface for executing commands on servers, abstracting away Lima-specific commands and direct SSH.

#### Interface

```typescript
export interface ServerConnection {
  exec(
    command: string,
    options?: {
      sudo?: boolean;
      label?: string;
      containerCommand?: string;
    }
  ): Promise<{ stdout: string; stderr: string }>;

  testConnection(): Promise<boolean>;
  setPodId(podId: string): void;
}

export interface ServerConnectionConfig {
  host: string;
  port: number;
  user: string;
  privateKey: string; // SSH private key content
}
```

#### Implementation

```typescript
export class SSHServerConnection implements ServerConnection {
  private config: ServerConnectionConfig;
  private podId: string | null = null;

  constructor(config: ServerConnectionConfig, podId?: string) {
    this.config = config;
    this.podId = podId || null;
  }

  async exec(
    command: string,
    options: { sudo?: boolean; label?: string; containerCommand?: string } = {},
  ): Promise<{ stdout: string; stderr: string }> {
    const keyPath = await this.getKeyFilePath();
    const sudoPrefix = options.sudo ? "sudo " : "";
    const fullCommand = `${sudoPrefix}${command}`;

    // Escape command for SSH
    const escapedCommand = fullCommand.replace(/'/g, "'\\''");
    const sshCommand = [
      "ssh",
      "-i", keyPath,
      "-o", "StrictHostKeyChecking=no",
      "-o", "UserKnownHostsFile=/dev/null",
      "-o", "LogLevel=ERROR",
      "-p", this.config.port.toString(),
      `${this.config.user}@${this.config.host}`,
      `'${escapedCommand}'`,
    ].join(" ");

    const startTime = Date.now();
    let exitCode = 0;

    try {
      const result = await execAsync(sshCommand);

      // Log command execution if podId is set
      if (this.podId) {
        await this.logCommand({
          command: fullCommand,
          containerCommand: options.containerCommand,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode,
          duration: Date.now() - startTime,
          label: options.label,
        });
      }

      return result;
    } catch (error) {
      // Handle errors and log failures
      exitCode = 1;
      if (this.podId) {
        await this.logCommand({ /* ... */ });
      }
      throw error;
    } finally {
      await unlink(keyPath); // Cleanup temp key file
    }
  }
}
```

#### Benefits

- ✅ **Unified Interface**: Same code for Lima (dev) and remote servers (prod)
- ✅ **Automatic Logging**: All commands logged to database when podId is set
- ✅ **Secure**: Temporary key files with proper permissions
- ✅ **Lima Transparent**: Lima VMs treated as regular SSH servers

### 3. Pod Provisioning Logs

**Location**: Database table `pod_logs`

Comprehensive logging of all commands executed during pod provisioning, distinguishing between infrastructure commands and container commands.

#### Schema

```sql
CREATE TABLE pod_logs (
  id TEXT PRIMARY KEY,
  pod_id TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  command TEXT NOT NULL,                 -- Full command (with docker exec wrapper)
  container_command TEXT,                 -- Original command inside container (user-facing)
  stdout TEXT DEFAULT '',
  stderr TEXT DEFAULT '',
  exit_code INTEGER NOT NULL,
  duration INTEGER NOT NULL,              -- Milliseconds
  label TEXT,                            -- Optional context (e.g., "📦 Cloning repository")
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### Command Types

**Infrastructure Commands** (`container_command IS NULL`):
- `docker network create ...`
- `docker create ...`
- `docker start ...`
- `docker inspect ...`

**Container Commands** (`container_command IS NOT NULL`):
- `git clone ...`
- `pnpm install ...`
- `rc-service code-server start`
- `mkdir -p /workspace/.ssh`

#### Frontend Query Examples

```typescript
// User-facing logs (what happened in their pod)
const userLogs = await db.query.podLogs.findMany({
  where: and(
    eq(podLogs.podId, podId),
    isNotNull(podLogs.containerCommand)
  ),
  orderBy: asc(podLogs.timestamp),
});

// Debug logs (infrastructure + container commands)
const debugLogs = await db.query.podLogs.findMany({
  where: eq(podLogs.podId, podId),
  orderBy: asc(podLogs.timestamp),
});

// Failed commands only
const errors = await db.query.podLogs.findMany({
  where: and(
    eq(podLogs.podId, podId),
    ne(podLogs.exitCode, 0)
  ),
});
```

### 4. Database Schema

#### Servers Table

```sql
CREATE TABLE server (
  id TEXT PRIMARY KEY,
  hostname VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  cpu_cores INTEGER NOT NULL,
  total_ram_gb REAL NOT NULL,
  total_disk_gb REAL NOT NULL,
  ssh_host VARCHAR(255) NOT NULL DEFAULT '',
  ssh_port INTEGER NOT NULL DEFAULT 22,
  ssh_user VARCHAR(50) NOT NULL DEFAULT 'root',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  last_heartbeat TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### Server Metrics Table

```sql
CREATE TABLE server_metrics (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES server(id),
  cpu_usage_percent REAL NOT NULL,
  ram_usage_gb REAL NOT NULL,
  disk_usage_gb REAL NOT NULL,
  active_pods_count INTEGER NOT NULL DEFAULT 0,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### Pod Metrics Table

```sql
CREATE TABLE pod_metrics (
  id TEXT PRIMARY KEY,
  pod_id TEXT NOT NULL, -- No FK constraint - pod may not exist yet
  cpu_percent REAL NOT NULL,
  memory_mb REAL NOT NULL,
  disk_mb REAL NOT NULL DEFAULT 0,
  network_rx_bytes REAL NOT NULL DEFAULT 0,
  network_tx_bytes REAL NOT NULL DEFAULT 0,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### Pods Table (Updated)

```sql
CREATE TABLE pod (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  owner_id TEXT NOT NULL REFERENCES user(id),
  team_id TEXT REFERENCES team(id),
  server_id TEXT REFERENCES server(id), -- NEW: Server assignment
  host_ip VARCHAR(45),
  internal_ip VARCHAR(45),
  status VARCHAR(50),
  tier VARCHAR(50),
  github_repo VARCHAR(500),
  config JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 5. tRPC API Endpoints

**Location**: `src/lib/trpc/routers/servers.ts`

#### Server Registration

```typescript
registerServer: publicProcedure
  .input(z.object({
    hostname: z.string(),
    ipAddress: z.string().ip(),
    cpuCores: z.number().int().positive(),
    totalRamGb: z.number().positive(),
    totalDiskGb: z.number().positive(),
    sshHost: z.string(),
    sshPort: z.number().int().positive(),
    sshUser: z.string(),
  }))
  .mutation(async ({ input, ctx }) => {
    // Validate API key
    const apiKey = ctx.req.headers.authorization?.replace('Bearer ', '');
    if (apiKey !== env.SERVER_API_KEY) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    // Check if server already exists
    const existing = await ctx.db.query.servers.findFirst({
      where: eq(servers.hostname, input.hostname),
    });

    if (existing) {
      // Update existing server
      await ctx.db
        .update(servers)
        .set({
          ...input,
          status: 'active',
          lastHeartbeat: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(servers.id, existing.id));

      return { id: existing.id };
    }

    // Create new server
    const [server] = await ctx.db
      .insert(servers)
      .values({
        id: generateKSUID('server'),
        ...input,
        status: 'active',
        lastHeartbeat: new Date(),
      })
      .returning();

    return { id: server.id };
  }),
```

#### Metrics Reporting

```typescript
reportMetrics: publicProcedure
  .input(z.object({
    serverId: z.string(),
    cpuUsagePercent: z.number().min(0).max(100),
    ramUsageGb: z.number().positive(),
    diskUsageGb: z.number().positive(),
    activePodsCount: z.number().int().min(0),
    podMetrics: z.array(z.object({
      podId: z.string(),
      cpuPercent: z.number().min(0),
      memoryMb: z.number().positive(),
      diskMb: z.number().min(0).default(0),
      networkRxBytes: z.number().min(0).default(0),
      networkTxBytes: z.number().min(0).default(0),
    })),
  }))
  .mutation(async ({ input, ctx }) => {
    // Validate API key
    const apiKey = ctx.req.headers.authorization?.replace('Bearer ', '');
    if (apiKey !== env.SERVER_API_KEY) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    // Insert server metrics
    await ctx.db.insert(serverMetrics).values({
      id: generateKSUID('server_metric'),
      serverId: input.serverId,
      cpuUsagePercent: input.cpuUsagePercent,
      ramUsageGb: input.ramUsageGb,
      diskUsageGb: input.diskUsageGb,
      activePodsCount: input.activePodsCount,
    });

    // Insert pod metrics
    if (input.podMetrics.length > 0) {
      await ctx.db.insert(podMetrics).values(
        input.podMetrics.map(pm => ({
          id: generateKSUID('pod_metric'),
          podId: pm.podId,
          cpuPercent: pm.cpuPercent,
          memoryMb: pm.memoryMb,
          diskMb: pm.diskMb,
          networkRxBytes: pm.networkRxBytes,
          networkTxBytes: pm.networkTxBytes,
        }))
      );
    }

    // Update heartbeat
    await ctx.db
      .update(servers)
      .set({ lastHeartbeat: new Date() })
      .where(eq(servers.id, input.serverId));

    return { success: true };
  }),
```

### 6. Background Worker

**Location**: `src/worker.ts`

Cleans up old metrics data to prevent database bloat.

```typescript
async function cleanupOldMetrics() {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

  // Delete old server metrics
  const serverMetricsDeleted = await db
    .delete(serverMetrics)
    .where(lt(serverMetrics.createdAt, fiveDaysAgo))
    .execute();

  // Delete old pod metrics
  const podMetricsDeleted = await db
    .delete(podMetrics)
    .where(lt(podMetrics.createdAt, fiveDaysAgo))
    .execute();

  // Delete old pod logs
  const podLogsDeleted = await db
    .delete(podLogs)
    .where(lt(podLogs.createdAt, fiveDaysAgo))
    .execute();

  console.log('✅ Cleaned up old metrics:', {
    serverMetrics: serverMetricsDeleted.rowCount || 0,
    podMetrics: podMetricsDeleted.rowCount || 0,
    podLogs: podLogsDeleted.rowCount || 0,
  });
}

// Run every hour
setInterval(cleanupOldMetrics, 60 * 60 * 1000);
```

## Integration Tests

**Location**: `src/lib/server-agent/__tests__/agent-integration.test.ts`

Tests the complete flow using Lima VM as a test server:

```typescript
describe('Server Agent Integration', () => {
  it('should register server on first startup', async () => {
    // Verify agent can register
    const servers = await db.query.servers.findMany({
      where: eq(servers.hostname, 'lima-gvisor-alpine'),
    });

    expect(servers).toHaveLength(1);
    expect(servers[0].cpuCores).toBeGreaterThan(0);
    expect(servers[0].totalRamGb).toBeGreaterThan(0);
  });

  it('should send heartbeat updates', async () => {
    // Wait for heartbeat
    await new Promise(resolve => setTimeout(resolve, 7000));

    const server = await db.query.servers.findFirst({
      where: eq(servers.hostname, 'lima-gvisor-alpine'),
    });

    expect(server.lastHeartbeat).toBeTruthy();
    expect(server.lastHeartbeat.getTime()).toBeGreaterThan(
      Date.now() - 10000
    );
  });

  it('should report server metrics', async () => {
    const metrics = await db.query.serverMetrics.findMany({
      where: eq(serverMetrics.serverId, serverId),
      orderBy: desc(serverMetrics.timestamp),
      limit: 1,
    });

    expect(metrics).toHaveLength(1);
    expect(metrics[0].cpuUsagePercent).toBeGreaterThan(0);
    expect(metrics[0].ramUsageGb).toBeGreaterThan(0);
  });

  it('should collect per-pod metrics', async () => {
    // Create a test pod
    const pod = await createTestPod();

    // Wait for metrics collection
    await new Promise(resolve => setTimeout(resolve, 7000));

    const metrics = await db.query.podMetrics.findMany({
      where: eq(podMetrics.podId, pod.id),
    });

    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics[0].cpuPercent).toBeGreaterThanOrEqual(0);
    expect(metrics[0].memoryMb).toBeGreaterThan(0);
  });
});
```

## Production Deployment

### Environment Variables

```bash
# Main App
DATABASE_URL=postgresql://...
SERVER_API_KEY=your-secure-api-key-here
SSH_PRIVATE_KEY="-----BEGIN OPENSSH PRIVATE KEY-----..."
SSH_PUBLIC_KEY="ssh-ed25519 AAAA..."
ADMIN_EMAILS=admin@example.com,admin2@example.com

# Server Agent (on each server)
MAIN_APP_URL=https://api.pinacle.dev
SERVER_API_KEY=your-secure-api-key-here
NODE_ENV=production
```

### Provisioning a New Server

```bash
# Set environment variables
export MAIN_APP_URL=https://api.pinacle.dev
export SERVER_API_KEY=your-secure-api-key-here
export SSH_PUBLIC_KEY="$(cat .env.local | grep SSH_PUBLIC_KEY | cut -d '=' -f2-)"

# Provision the server
./scripts/provision-server.sh user@new-server-ip

# Verify registration
psql $DATABASE_URL -c "SELECT * FROM server ORDER BY created_at DESC LIMIT 1;"
```

### Server Requirements

- **OS**: Linux (Alpine Linux recommended)
- **RAM**: Minimum 8GB (16GB+ recommended)
- **CPU**: 4+ cores
- **Disk**: 100GB+ SSD
- **Network**: Public IP with SSH access
- **Software**: Docker, gVisor, OpenRC (installed by provision script)

## Key Features

✅ **Self-Registration**: Servers automatically register on startup
✅ **Real-Time Metrics**: System and per-pod metrics every 5 seconds
✅ **SSH Abstraction**: Unified interface for Lima and remote servers
✅ **Comprehensive Logging**: Every command execution logged with stdout/stderr
✅ **Automatic Cleanup**: Old metrics cleaned up after 5 days
✅ **Health Monitoring**: Heartbeat tracking for server availability
✅ **Dev/Prod Parity**: Same code works for Lima VMs and production servers

## Admin Dashboard (Future)

Users in `ADMIN_EMAILS` will have access to:

- Server list with real-time status
- CPU, memory, disk usage graphs
- Active pod count per server
- Pod allocation history
- Server health alerts
- Manual server registration/deregistration

## Scaling Strategy

1. **Add New Server**: Run provision script
2. **Agent Auto-Registers**: Server appears in dashboard
3. **Allocate Pods**: Main app can now deploy pods to new server
4. **Monitor**: Metrics collected automatically

**Capacity**: Each 64GB server can run ~50-100 dev pods depending on tier mix.

