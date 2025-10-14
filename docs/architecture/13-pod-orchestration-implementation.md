# Pod Orchestration System - Implementation Summary

## Overview

This document describes the **implemented** pod orchestration system for Pinacle. The system manages gVisor-based development containers with full lifecycle management, networking, and service provisioning.

**Status**: ✅ **Fully Implemented and Tested**

**Location**: `src/lib/pod-orchestration/`

## Core Architecture

### System Components

The `PodManager` is instantiated per pod and orchestrates all operations for a single pod:

```
┌──────────────┐
│  PodManager  │  ← Per-pod orchestrator (takes podId in constructor)
└──────┬───────┘
       │
       ├─────► GVisorRuntime       (Docker/gVisor operations)
       ├─────► NetworkManager      (Networking & port allocation)
       ├─────► ServiceProvisioner  (Service lifecycle)
       ├─────► GitHubIntegration   (Repository management)
       └─────► ConfigResolver      (Configuration management)
```

Each `PodManager` instance is created with `new PodManager(podId, serverConnection)` and operates on that specific pod. All methods operate on `this.podId` internally, so no `podId` parameters are needed. Pod state is stored in the database, not in memory.

### File Structure

```
src/lib/pod-orchestration/
├── pod-manager.ts              # Main orchestrator
├── container-runtime.ts        # Docker/gVisor runtime
├── network-manager.ts          # Networking & ports
├── service-provisioner.ts      # Service templates
├── github-integration.ts       # Git operations
├── config-resolver.ts          # Config validation
├── server-connection.ts        # SSH abstraction
├── lima-utils.ts               # Lima VM utilities
├── types.ts                    # Type definitions (PodSpec)
├── pinacle-config.ts           # PinacleConfig (YAML)
├── template-registry.ts        # Pod templates
├── service-registry.ts         # Service definitions
├── resource-tier-registry.ts   # Resource tiers
└── __tests__/
    ├── integration.test.ts     # Integration tests
    └── pinacle-yaml-integration.test.ts
```

## Key Features Implemented

### 1. Cross-Platform Development with SSH Abstraction

**Problem**: gVisor doesn't run natively on macOS, and we need unified code for local (Lima) and production servers.

**Solution**: `ServerConnection` interface that abstracts SSH execution.

**Implementation:**
- Interface: `src/lib/pod-orchestration/types.ts` (ServerConnection interface)
- Concrete class: `src/lib/pod-orchestration/server-connection.ts` (SSHServerConnection)

The `SSHServerConnection` class:
- Executes commands via SSH on Lima VMs or remote servers
- Automatically logs all commands to `pod_logs` table
- Tracks both infrastructure and container commands
- Handles sudo, retries, and error handling

**Benefits**:
- ✅ Unified codebase for local and production
- ✅ Automatic command logging
- ✅ Lima VMs treated as regular SSH servers
- ✅ Container command tracking

**Usage in:**
- `container-runtime.ts` - All Docker commands
- `network-manager.ts` - Networking setup
- `service-provisioner.ts` - Service management

### 2. Dynamic Lima Port Handling

**Problem**: Lima VMs use dynamic SSH ports that change on every start.

**Solution**: Retrieve ports dynamically via `limactl show-ssh` and store Lima VM name in database.

**Implementation:**
- `src/lib/pod-orchestration/lima-utils.ts` - `getLimaSshPort(vmName)`
- `src/lib/db/schema.ts` - `servers.limaVmName` column
- `scripts/provision-server.sh` - Passes `LIMA_VM_NAME` to agent
- `server-agent/src/index.ts` - Reports Lima VM name during registration

**Flow:**
1. Server agent announces itself as Lima VM (if applicable)
2. API stores `limaVmName` in `servers` table
3. On pod provisioning, API calls `getLimaSshPort(limaVmName)`
4. Dynamic port passed to `SSHServerConnection` and `LimaGVisorRuntime`

### 3. Hostname-Based Port Routing

**Problem**: Need dynamic port access without restarting pods or managing many external ports.

**Solution**: Single external port per pod with Nginx proxy inside container.

**Implementation:** `src/lib/pod-orchestration/container-runtime.ts`

Nginx inside container:
- Listens on port 80
- Extracts target port from hostname (e.g., `localhost-8726.pod-test.localhost`)
- Proxies to `localhost:<port>` inside container
- Rewrites Host header for transparency

**Example:**
```
Browser: http://localhost-8726.pod-test.localhost:30000
         ↓
Lima VM forwards :30000 → container :80
         ↓
Nginx proxies to localhost:8726 (code-server)
```

**Files:**
- `container-runtime.ts` - Generates Nginx config
- `network-manager.ts` - Port allocation and mapping

### 4. gVisor Runtime (Rootless Security)

**Problem**: Traditional containers run as root, security risk.

**Solution**: gVisor provides lightweight VM-like isolation.

**Implementation:** `src/lib/pod-orchestration/container-runtime.ts`

The `GVisorRuntime` class:
- Uses `runsc` runtime via Docker
- Runs in Lima VMs on macOS, native on Linux
- OpenRC init system inside containers
- Syscall filtering and namespace isolation

**Key methods:**
- `createContainer(spec: PodSpec)` - Create gVisor container
- `startContainer(containerId)` - Start container
- `stopContainer(containerId)` - Stop container
- `removeContainer(containerId)` - Remove container
- `getContainer(containerId)` - Get container info
- `getContainerForPod(podId)` - Find container by pod ID
- `execInContainer(podId, containerId, command[])` - Execute command
- `getContainerLogs(containerId, options)` - Get logs
- `validateGVisorRuntime()` - Check if gVisor is available

**Files:**
- `container-runtime.ts` - GVisorRuntime class with Docker operations
- `server-connection.ts` - SSH abstraction used by runtime
- `scripts/provision-server.sh` - Server provisioning with gVisor

### 5. Network Architecture

**Implementation:** `src/lib/pod-orchestration/network-manager.ts`

Each pod gets:
- **Dedicated subnet** (e.g., `10.249.1.0/24`)
- **Gateway IP** (e.g., `10.249.1.1`)
- **Container IP** (e.g., `10.249.1.2`)
- **Single external port** (e.g., `30000`)

Port allocation:
- External ports start at 30000, increment per pod
- Stored in database (`pods.ports` JSON)
- Lima VM forwards external port → container:80

**Container networking:**
- Docker bridge network per pod
- Internal DNS resolution
- Services communicate via localhost
- External access via single port + hostname routing

### 6. Service Provisioning

**Implementation:**
- `src/lib/pod-orchestration/service-provisioner.ts` - ServiceProvisioner class
- `src/lib/pod-orchestration/service-registry.ts` - Service template definitions

The `ServiceProvisioner` class:
```typescript
// Per-pod instance
const serviceProvisioner = new ServiceProvisioner(podId, serverConnection);

// Service lifecycle methods
await serviceProvisioner.provisionService(service, projectFolder);
await serviceProvisioner.startService(podId, serviceName);
await serviceProvisioner.stopService(podId, serviceName);
await serviceProvisioner.removeService(podId, serviceName);
await serviceProvisioner.checkServiceHealth(podId, serviceName);
```

**Service lifecycle:**
1. Read service definition from registry via `getServiceTemplateUnsafe(serviceName)`
2. Install dependencies via `installScript` commands
3. Create OpenRC service script with `startCommand`
4. Start service via `rc-service <name> start`
5. Verify health using `healthCheckCommand`

**Available services:**
See `src/lib/pod-orchestration/service-registry.ts` for all service templates:
- AI: claude-code, cursor-cli, openai-codex, gemini-cli
- Tools: code-server, vibe-kanban, web-terminal
- Databases: postgres, redis
- Other: jupyter

Each service template defines:
- Display name, icon, default port
- Installation script (array of shell commands)
- Start command function (returns command array based on context)
- Health check command
- Cleanup command
- Environment variables

### 7. GitHub Integration

**Implementation:** `src/lib/pod-orchestration/github-integration.ts`

Capabilities:
- Clone repositories via Git
- Read files via GitHub API
- Inject `pinacle.yaml` into container
- SSH key management for private repos

**pinacle.yaml injection:**
1. Generate `PinacleConfig` from form data
2. Serialize to YAML via `serializePinacleConfig()`
3. Write to `/workspace/pinacle.yaml` in container
4. User can commit to version control

**Files:**
- `github-integration.ts` - Git operations
- `pinacle-config.ts` - YAML serialization
- `src/lib/trpc/routers/github-app.ts` - GitHub App API

### 8. Configuration System

**Implementation:** See [pod-config-representations.md](./pod-config-representations.md)

Three representations:
1. **PinacleConfig** - User-facing YAML (`pinacle-config.ts`)
2. **Database Schema** - Normalized storage (`schema.ts`)
3. **PodSpec** - Runtime specification (`types.ts`)

**Configuration flow:**
1. Form submission → `generatePinacleConfigFromForm()`
2. Store in DB as JSON (`pods.config`)
3. On provisioning → `podRecordToPinacleConfig()`
4. Expand to PodSpec → `ConfigResolver.loadConfig()`
5. Inject YAML → `serializePinacleConfig()`

**Key functions:**
- `src/lib/pod-orchestration/pinacle-config.ts` - All PinacleConfig helpers
- `src/lib/pod-orchestration/config-resolver.ts` - PinacleConfig → PodSpec expansion

### 9. Template System

**Implementation:** `src/lib/pod-orchestration/template-registry.ts`

Templates provide base configurations:
- Base Docker image
- Default services
- Environment variable defaults (with generators)
- Technology stack indicators

**Available templates:**
- `nextjs` - Next.js applications
- `vite` - Vite/React applications
- `langflow` - Langflow AI applications
- `nodejs-blank` - Blank Node.js environment
- `python-blank` - Blank Python environment

**Environment defaults:**
- Static values (e.g., `DATABASE_URL`)
- Generated values (e.g., `NEXTAUTH_SECRET` via `openssl rand -hex 32`)
- UI indicators for auto-generated values

### 10. Resource Management

**Implementation:** `src/lib/pod-orchestration/resource-tier-registry.ts`

Tiers abstract CPU/memory/storage:

| Tier | CPU | Memory | Storage | Price |
|------|-----|--------|---------|-------|
| dev.small | 0.5 | 1GB | 10GB | $10/mo |
| dev.medium | 1 | 2GB | 20GB | $20/mo |
| dev.large | 2 | 4GB | 40GB | $40/mo |
| dev.xlarge | 4 | 8GB | 80GB | $80/mo |

**Resource derivation:**
- `PinacleConfig` stores tier ID only
- Resources derived at runtime via `getResourcesFromTier(tierId)`
- No duplication in database

### 11. Command Logging

**Implementation:** `src/lib/pod-orchestration/server-connection.ts`

All SSH commands logged to `pod_logs` table:
- Infrastructure commands (Docker, network setup)
- Container commands (user actions)
- stdout, stderr, exit code, duration
- Timestamps and labels

**Benefits:**
- Debugging and auditing
- Performance monitoring
- User activity tracking
- Error investigation

### 12. Pod Lifecycle Management

**Implementation:** `src/lib/pod-orchestration/pod-manager.ts`

**Usage:**
```typescript
const podManager = new PodManager(podId, serverConnection);

// Methods operate on the specific pod instance
await podManager.createPod(spec);
await podManager.startPod();
await podManager.stopPod();
await podManager.deletePod();
```

**Methods:**
- `createPod(spec: PodSpec)` - Create and provision a new pod
- `startPod()` - Start the pod's container
- `stopPod()` - Stop the pod's container
- `deletePod()` - Remove pod and clean up resources
- `cleanupPod()` - Clean up pod resources (finds container by podId)
- `cleanupPodByContainerId(containerId)` - Clean up using container ID from database
- `getPodContainer()` - Get container info for the pod
- `execInPod(command[])` - Execute command in pod
- `getPodLogs(options)` - Get pod logs
- `checkPodHealth()` - Check if pod is healthy
- `hibernatePod()` - Hibernate pod (TODO)
- `wakePod()` - Wake hibernated pod (TODO)

The `PodManager` emits events via EventEmitter: `created`, `started`, `stopped`, `failed`, `deleted`, `health_check`. Dependencies like `GVisorRuntime`, `NetworkManager`, and `ServiceProvisioner` are instantiated in the constructor.

**Files:**
- `pod-manager.ts` - Main per-pod orchestrator class
- `pod-provisioning-service.ts` - Provisioning service (creates PodManager instances)
- `src/lib/trpc/routers/pods.ts` - API endpoints

## Testing

**Integration tests:** `src/lib/pod-orchestration/__tests__/integration.test.ts`

Tests cover:
- ✅ Pod creation end-to-end
- ✅ Container lifecycle (start, stop, destroy)
- ✅ Network configuration
- ✅ Service provisioning
- ✅ GitHub repository cloning
- ✅ pinacle.yaml injection
- ✅ Lima dynamic port handling

**Requirements:**
- Running Lima VM (`gvisor-alpine`)
- Test database
- GitHub test repository

**Run tests:**
```bash
pnpm test src/lib/pod-orchestration/__tests__/integration.test.ts
```

## Production Deployment

**Server provisioning:** `scripts/provision-server.sh`

Installs:
- Docker with gVisor runtime
- Server agent (reports metrics)
- SSH key configuration
- Environment variables

**Server agent:** `server-agent/`

- Reports hardware info to API
- Sends heartbeat every 30s
- Announces Lima VM name (if applicable)
- Handles graceful shutdown

**API registration:** `src/lib/trpc/routers/servers.ts`

- Accepts server hardware info
- Stores in `servers` table
- Tracks online/offline status
- Stores `limaVmName` for dynamic ports

## Performance Considerations

**Optimizations:**
- Port ranges prevent conflicts (30000-39999)
- Network namespaces isolate pods
- OpenRC parallel service startup
- Nginx caching for static assets
- Health checks prevent cascading failures

**Limitations:**
- One external port per pod (hostname routing adds latency)
- OpenRC not as sophisticated as systemd
- gVisor has ~10-20% performance overhead
- Lima adds SSH latency on macOS

## Future Improvements

**Planned enhancements:**

1. **Multi-server orchestration**
   - Load balancing across servers
   - Pod migration between servers
   - Automatic failover

2. **Advanced networking**
   - Pod-to-pod communication
   - Private networks for teams
   - Custom DNS resolution

3. **Monitoring & observability**
   - Metrics collection (CPU, memory, disk)
   - Real-time logs streaming
   - Performance dashboards

4. **Autoscaling**
   - Vertical scaling (change tier)
   - Horizontal scaling (multiple instances)
   - Resource limits and quotas

## Related Documentation

- [pod-config-representations.md](./pod-config-representations.md) - Configuration architecture
- [02-pod-configuration.md](./02-pod-configuration.md) - Configuration details
- [03-pod-lifecycle.md](./03-pod-lifecycle.md) - Lifecycle states
- [04-networking.md](./04-networking.md) - Network architecture
- [14-server-management-system.md](./14-server-management-system.md) - Server infrastructure
