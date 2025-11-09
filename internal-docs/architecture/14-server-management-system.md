# Server Management System

## Overview

The server management system handles registration, monitoring, and lifecycle of pod host servers. Servers can be production machines or Lima VMs for local development.

**Implementation:**
- `server-agent/` - Agent running on each server
- `scripts/provision-server.sh` - Server provisioning script
- `src/lib/trpc/routers/servers.ts` - Server API endpoints
- `src/lib/db/schema.ts` - `servers` table

## Architecture

```
┌────────────────────────────────────────┐
│         Pinacle API Server             │
│  ┌──────────────────────────────────┐  │
│  │  Server Registry                 │  │
│  │  (PostgreSQL servers table)      │  │
│  └──────────────┬───────────────────┘  │
└─────────────────┼──────────────────────┘
                  │
      ┌───────────┴───────────┐
      │                       │
┌─────▼──────┐        ┌───────▼────────┐
│ Lima VM    │        │ Production     │
│ (macOS)    │        │ Server         │
│            │        │                │
│ Agent      │        │ Agent          │
│ (reports)  │        │ (reports)      │
└────────────┘        └────────────────┘
```

## Server Agent

**Location:** `server-agent/`

**Purpose:** Reports server hardware info and metrics to API

### Agent Responsibilities

1. **Registration**
   - Report hostname, IP, CPU, memory, disk
   - Identify Lima VMs via `LIMA_VM_NAME` env var
   - Receive server ID from API

2. **Heartbeat**
   - Send heartbeat every 30 seconds
   - Report current metrics (CPU, memory, disk usage)
   - Update server status to "online"

3. **Graceful Shutdown**
   - On SIGTERM/SIGINT, notify API
   - Set server status to "offline"
   - Clean exit

### Implementation

**Main file:** `server-agent/src/index.ts`

**Key functions:**

`getServerInfo()` - Collects hardware info:
- Hostname via `os.hostname()`
- IP address (first non-internal IPv4)
- CPU cores via `os.cpus().length`
- Memory via `os.totalmem()`
- Disk space via `df` command
- SSH host/port/user from env vars
- Lima VM name (if `LIMA_VM_NAME` set)

`registerServer()` - Posts to API:
- Endpoint: `servers.registerServer` (tRPC)
- Sends all hardware info
- Receives server ID
- Stores for subsequent heartbeats

`sendHeartbeat()` - Updates metrics:
- Endpoint: `servers.heartbeat` (tRPC)
- Sends server ID
- Reports current CPU/memory/disk usage
- Runs every 30s

### Authentication

**Server Agent Token:** `process.env.SERVER_AGENT_TOKEN`

- Set in `.env` during provisioning
- Validated via tRPC middleware
- Scoped to server operations only

## Server Provisioning

**Script:** `scripts/provision-server.sh`

**Usage:**
```bash
./scripts/provision-server.sh <host> [--test]
```

**Host formats:**
- `lima:gvisor-alpine` - Lima VM (local development)
- `user@server-ip` - Remote server (production)

### Provisioning Steps

1. **Prerequisites check**
   - SSH connection
   - Docker installed
   - gVisor runtime available

2. **Docker setup**
   - Install gVisor runtime (`runsc`)
   - Configure Docker daemon
   - Restart Docker service

3. **Agent setup**
   - Copy agent source to server
   - Install Node.js (if needed)
   - Install dependencies
   - Build agent

4. **Environment configuration**
   - Create `.env` file
   - Set `API_URL`, `SERVER_AGENT_TOKEN`
   - Set SSH connection details
   - Add `LIMA_VM_NAME` if Lima VM

5. **Service setup**
   - Create systemd service (Linux)
   - Create launchd service (macOS/Lima)
   - Start agent
   - Verify registration

### Lima VM Handling

**Lima VMs are identified by:**
- Host format: `lima:<vm-name>`
- `LIMA_VM_NAME` in agent's `.env`
- Reported to API during registration

**Dynamic port handling:**
- Lima VM SSH ports change on restart
- API retrieves port via `getLimaSshPort(vmName)`
- No hardcoded ports in database

**Implementation:** `src/lib/pod-orchestration/lima-utils.ts`

## Server Database Schema

**Table:** `servers` in `src/lib/db/schema.ts`

**Columns:**
- `id` - Server ID (KSUID)
- `hostname` - Server hostname
- `ipAddress` - Server IP
- `cpuCores` - Number of CPU cores
- `memoryMb` - Total memory (MB)
- `diskGb` - Total disk space (GB)
- `sshHost` - SSH hostname/IP
- `sshPort` - SSH port
- `sshUser` - SSH username
- `limaVmName` - Lima VM name (null for production)
- `status` - online/offline/error
- `lastHeartbeatAt` - Last heartbeat timestamp
- `createdAt` - Registration timestamp

## Server API Endpoints

**File:** `src/lib/trpc/routers/servers.ts`

### `registerServer`

**Auth:** Server agent token required

**Input:**
```typescript
{
  hostname: string
  ipAddress: string
  cpuCores: number
  memoryMb: number
  diskGb: number
  sshHost: string
  sshPort: number
  sshUser: string
  limaVmName?: string  // Optional, for Lima VMs
}
```

**Returns:** Server record with ID

**Behavior:**
- Creates new server record
- Sets status to "online"
- Records timestamp

### `heartbeat`

**Auth:** Server agent token required

**Input:**
```typescript
{
  serverId: string
  cpuUsage?: number
  memoryUsage?: number
  diskUsage?: number
}
```

**Returns:** Success/failure

**Behavior:**
- Updates `lastHeartbeatAt`
- Updates metrics if provided
- Sets status to "online"

### `getServers` (Future)

**Auth:** Admin user required

Lists all registered servers with status

### `removeServer` (Future)

**Auth:** Admin user required

Deregisters server and cleans up

## Lima VM Support

### Problem

Lima VMs use dynamic SSH ports that change on every VM restart. Hardcoding ports (like `52111`) breaks on VM restart.

### Solution

1. **Store VM name:** `servers.limaVmName` column
2. **Dynamic port retrieval:** `getLimaSshPort(vmName)` via `limactl show-ssh`
3. **Just-in-time resolution:** Retrieve port when needed, not stored

### Implementation

**Provisioning:**
```bash
# In provision-server.sh for Lima hosts
if [[ $HOST == lima:* ]]; then
  ENV_CONTENT="$ENV_CONTENT
LIMA_VM_NAME=$LIMA_VM"
fi
```

**Agent registration:**
```typescript
// server-agent/src/index.ts
if (process.env.LIMA_VM_NAME) {
  serverInfo.limaVmName = process.env.LIMA_VM_NAME;
}
```

**Port retrieval:**
```typescript
// src/lib/pod-orchestration/lima-utils.ts
export const getLimaSshPort = async (vmName: string): Promise<number> => {
  const { stdout } = await execAsync(`limactl show-ssh ${vmName}`);
  const portMatch = stdout.match(/Port=(\d+)/);
  return Number.parseInt(portMatch[1], 10);
};
```

**Usage in provisioning:**
```typescript
// src/lib/pod-orchestration/pod-provisioning-service.ts
if (server.limaVmName) {
  const sshPort = await getLimaSshPort(server.limaVmName);
  const connection = new SSHServerConnection({ ...config, sshPort });
}
```

## Server Selection

**Current:** Single server (hardcoded or from database)

**Future:** Intelligent server selection based on:
- Available resources (CPU, memory, disk)
- Current load
- Geographic location
- Cost optimization

**Implementation:** `ServerOrchestrator` class (future)

## Monitoring

**Current:** Basic heartbeat tracking

**Future:**
- Real-time metrics dashboards
- Alerting on server failures
- Resource usage graphs
- Predictive scaling

## High Availability

**Current:** No HA

**Future:**
- Multiple servers
- Automatic failover
- Load balancing
- Pod migration between servers

## Security

**Agent authentication:**
- Shared token (`SERVER_AGENT_TOKEN`)
- Validated on every API call
- Rotated periodically (future)

**SSH access:**
- Private key authentication
- Key stored securely
- Per-pod keys for isolation

**Network isolation:**
- Agents communicate via HTTPS only
- API endpoints restricted to agent operations
- No direct server-to-server communication

## Troubleshooting

**Agent not connecting:**
- Check network connectivity
- Verify `API_URL` in `.env`
- Validate `SERVER_AGENT_TOKEN`
- Check agent logs

**Heartbeat failures:**
- Check server status in database
- Verify agent is running
- Check API endpoint availability

**Lima VM port issues:**
- Verify VM is running: `limactl list`
- Check port via: `limactl show-ssh <vmName>`
- Restart VM if needed

**SSH connection failures:**
- Verify SSH key configuration
- Check firewall rules
- Test manual SSH connection

## Related Documentation

- [13-pod-orchestration-implementation.md](./13-pod-orchestration-implementation.md) - Pod orchestration
- [03-pod-lifecycle.md](./03-pod-lifecycle.md) - Pod lifecycle
- `server-agent/` - Agent source code
- `scripts/provision-server.sh` - Provisioning script
- `src/lib/trpc/routers/servers.ts` - API endpoints
