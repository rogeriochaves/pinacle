# Pod Orchestration System - Implementation Summary

## Overview

This document describes the **implemented** pod orchestration system for Pinacle. The system manages gVisor-based development containers with full lifecycle management, networking, and service provisioning.

**Status**: ✅ **Fully Implemented and Tested**

**Location**: `src/lib/pod-orchestration/`

## Core Architecture

### System Components

```
┌──────────────┐
│  PodManager  │  ← Main orchestrator
└──────┬───────┘
       │
       ├─────► ContainerRuntime    (Docker/gVisor operations)
       ├─────► NetworkManager      (Networking & port allocation)
       ├─────► ServiceProvisioner  (Service lifecycle)
       └─────► ConfigResolver      (Configuration management)
```

### File Structure

```
src/lib/pod-orchestration/
├── pod-manager.ts          # Main orchestrator
├── container-runtime.ts    # Docker/gVisor runtime
├── network-manager.ts      # Networking & ports
├── service-provisioner.ts  # Service templates
├── config-resolver.ts      # Config validation
├── types.ts                # Type definitions
└── __tests__/
    └── integration.test.ts # Integration tests
```

## Key Features Implemented

### 1. Cross-Platform Development with SSH Abstraction

**Problem**: gVisor doesn't run natively on macOS, and we need unified code for local (Lima) and production servers.

**Solution**: `ServerConnection` interface that abstracts SSH execution.

```typescript
// Unified interface for Lima VMs and remote servers
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
  setPodId(podId: string): void; // Enable automatic logging
}

// Implementation using SSH
class SSHServerConnection implements ServerConnection {
  constructor(config: ServerConnectionConfig, podId?: string) {
    // Works for both Lima (127.0.0.1:52111) and remote servers
    this.config = config; // { host, port, user, privateKey }
    this.podId = podId;
  }

  async exec(command: string, options = {}) {
    // Execute via SSH
    // Automatically logs to pod_logs table if podId is set
    const sshCommand = `ssh -i ${keyPath} -p ${port} ${user}@${host} '${command}'`;
    const result = await execAsync(sshCommand);

    if (this.podId) {
      await this.logCommand({
        command,
        containerCommand: options.containerCommand,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        duration: result.duration,
        label: options.label,
      });
    }

    return result;
  }
}

// Usage: Same code for Lima and production
const runtime = new LimaGVisorRuntime(limaConfig, undefined, podId);
const connection = new SSHServerConnection({
  host: "127.0.0.1",    // or production server IP
  port: 52111,           // or 22 for production
  user: process.env.USER,
  privateKey: env.SSH_PRIVATE_KEY,
}, podId);
```

**Benefits**:
- ✅ **Unified Codebase**: Same code for local and production
- ✅ **Automatic Logging**: All commands logged to `pod_logs` table
- ✅ **Lima Transparent**: Lima VMs treated as regular SSH servers
- ✅ **Container Command Tracking**: Separates infrastructure vs user commands

**Files**:
- `server-connection.ts`: SSH abstraction implementation
- `container-runtime.ts`: Uses ServerConnection for all Docker commands
- `network-manager.ts`: Uses ServerConnection for networking
- `service-provisioner.ts`: Uses ServerConnection for service management

### 2. Hostname-Based Port Routing

**Problem**: Need dynamic port access without restarting pods or managing many external ports.

**Solution**: Single external port per pod with Nginx proxy inside container.

#### Architecture

```
Browser: http://localhost-8726.pod-test.localhost:30000
           ↓
Lima VM forwards :30000 → container :80
           ↓
Nginx extracts "8726" from hostname
           ↓
Nginx proxies to localhost:8726 (code-server)
```

#### Nginx Configuration

```nginx
server {
    listen 80 default_server;

    # Extract target port from hostname
    set $target_port 3000;
    if ($host ~* ^localhost-(\d+)\..*$) {
        set $target_port $1;
    }

    location / {
        proxy_pass http://127.0.0.1:$target_port;

        # Critical: Rewrite Host header for transparency
        proxy_set_header Host localhost:$target_port;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # Long-running connections (7 days)
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;

        # No buffering for real-time apps
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
```

**Files**:
- `docker/config/nginx.conf`: Full configuration
- `docker/Dockerfile.base`: Lines 45-50 (Nginx installation)

#### Benefits

- ✅ **Single port per pod**: Simplifies firewall/routing
- ✅ **Dynamic services**: Add new services without pod restart
- ✅ **WebSocket support**: Full transparency for WS connections
- ✅ **No DNS setup**: `.localhost` TLD works automatically in browsers

### 3. Service Provisioning

Pre-configured service templates with health checks and lifecycle management.

#### Implemented Services

| Service | Port | Description | Status |
|---------|------|-------------|--------|
| code-server | 8726 | VS Code in browser | ✅ Working |
| vibe-kanban | 5262 | Kanban board | ✅ Working |
| claude-code | 2528 | AI coding assistant | ✅ Working |
| web-terminal | 7681 | ttyd web terminal | ✅ Working |

#### Service Template Structure

```typescript
type ServiceTemplate = {
  name: string;
  installScript: string[];          // Installation commands
  startCommand: string[];            // Service start command
  cleanupCommand: string[];          // Cleanup on stop
  healthCheckCommand: string[];      // Health check
  defaultPort: number;               // Default internal port
  preStartHooks?: string[];          // Pre-start setup
  postStartHooks?: string[];         // Post-start verification
  environmentVariables?: Record<string, string>;
};
```

#### Code-Server Configuration

The code-server service includes special flags for proxy transparency:

```typescript
startCommand: [
  "code-server",
  "--bind-addr", "0.0.0.0",
  "--auth", "none",
  "--trusted-origins", "*"  // ← Critical for WebSocket through proxy
]
```

**Files**:
- `service-provisioner.ts`: Lines 33-200 (All service templates)

### 4. Pod Provisioning Logs

**Status**: ✅ **Fully Implemented**

Comprehensive logging of every command executed during pod provisioning, stored in PostgreSQL for user visibility and debugging.

#### Database Schema

```sql
CREATE TABLE pod_logs (
  id TEXT PRIMARY KEY,
  pod_id TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  command TEXT NOT NULL,                 -- Full command (with docker exec if applicable)
  container_command TEXT,                 -- Original command inside container (NULL for infrastructure)
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
- Used for debugging and system administrators
- Examples: `docker network create`, `docker inspect`, `netstat`

**Container Commands** (`container_command IS NOT NULL`):
- What users see - commands executed inside their pod
- Examples: `git clone`, `pnpm install`, `rc-service code-server start`

#### Automatic Logging

All commands executed through `ServerConnection` are automatically logged:

```typescript
// In container-runtime.ts
async execCommand(containerId: string, command: string[]): Promise<...> {
  const commandStr = command.join(" ");
  const dockerCommand = `docker exec ${containerId} ${commandStr}`;

  // Automatically logs with both full command and original container command
  const result = await this.exec(dockerCommand, true, commandStr);
  //                                                    ^^^^^^^^^^
  //                                        This becomes container_command in DB

  return result;
}
```

#### User-Facing Query

```typescript
// Get logs user cares about (commands inside their pod)
const userLogs = await db.query.podLogs.findMany({
  where: and(
    eq(podLogs.podId, podId),
    isNotNull(podLogs.containerCommand) // Only container commands
  ),
  orderBy: asc(podLogs.timestamp),
});

// Display like a terminal
userLogs.forEach(log => {
  if (log.label) console.log(log.label); // e.g., "📦 Cloning repository"
  console.log(`$ ${log.containerCommand}`);
  if (log.stdout) console.log(log.stdout);
  if (log.stderr) console.error(log.stderr);
  if (log.exitCode !== 0) console.error(`Exit code: ${log.exitCode}`);
});
```

#### Benefits

- ✅ **Terminal-Like Output**: Users see exactly what's happening in their pod
- ✅ **Debugging**: Full command history with stdout/stderr/exit codes
- ✅ **Performance Tracking**: Duration recorded for every command
- ✅ **Automatic Cleanup**: Old logs deleted after 5 days
- ✅ **Infrastructure Visibility**: Debug infrastructure issues separately

**Files**:
- `server-connection.ts`: Automatic logging in `exec()` method
- `src/worker.ts`: Cleanup of old logs

### 5. Network Isolation

Each pod runs in an isolated Docker network with unique bridge.

#### Network Configuration

```typescript
// Create unique network per pod
const networkName = `pod-${podId}`;
const bridgeName = `br-${podId.substring(0, 12)}`;

await execDockerCommand(
  `docker network create ${networkName} ` +
  `--driver bridge ` +
  `--opt com.docker.network.bridge.name=${bridgeName}`
);
```

**Benefits**:
- ✅ **Isolation**: Pods can't see each other
- ✅ **Unique IPs**: No IP conflicts between pods
- ✅ **Easy cleanup**: Delete network to clean up

**Files**:
- `network-manager.ts`: Lines 50-120 (Network creation)

### 5. Port Allocation Strategy

**Old Approach** (rejected):
- Allocate external port for each service
- Port conflicts across pods
- Complex port management

**Current Approach** (implemented):
- **One** external port per pod (for Nginx proxy)
- Nginx routes to internal services dynamically
- Port range: 30000-40000

```typescript
class NetworkManager {
  private portRange = { start: 30000, end: 40000 };
  private allocatedPorts = new Set<number>();

  async allocateExternalPort(): Promise<number> {
    for (let port = this.portRange.start; port <= this.portRange.end; port++) {
      if (!this.allocatedPorts.has(port) && await this.isPortAvailable(port)) {
        this.allocatedPorts.add(port);
        return port;
      }
    }
    throw new Error('No available ports in range');
  }
}
```

**Files**:
- `network-manager.ts`: Lines 200-280 (Port allocation)

### 6. Configuration System

Zod-based configuration validation with sensible defaults.

#### Configuration Schema

```typescript
const PodConfigSchema = z.object({
  name: z.string(),
  slug: z.string(),
  baseImage: z.string().optional().default('pinacledev/pinacle-base'),
  services: z.array(z.string()).optional().default([]),
  environment: z.record(z.string(), z.string()).optional().default({}),
  ports: z.array(PortMappingSchema).optional().default([]),
  hooks: z.object({
    preStart: z.array(z.string()).optional(),
    postStart: z.array(z.string()).optional(),
  }).optional(),
});
```

#### Port Conflict Validation

```typescript
validatePortConflicts(config: PodConfig): ValidationResult {
  const usedPorts = new Set<number>();

  // Check network-level ports
  for (const port of config.ports) {
    if (usedPorts.has(port.internal)) {
      return { valid: false, error: `Port ${port.internal} already in use` };
    }
    usedPorts.add(port.internal);
  }

  // Check service ports (per-service, so reset for each)
  for (const service of config.services) {
    const serviceConfig = this.getServiceTemplate(service);
    const servicePorts = new Set<number>();

    for (const port of serviceConfig.ports) {
      if (servicePorts.has(port)) {
        return { valid: false, error: `Service ${service} has duplicate port` };
      }
      servicePorts.add(port);
    }
  }

  return { valid: true };
}
```

**Files**:
- `config-resolver.ts`: Lines 20-250 (Full validation)

### 7. Lifecycle Management

Complete pod lifecycle with state management and error handling.

#### Pod States

```typescript
enum PodState {
  PENDING = 'pending',           // Awaiting resources
  PROVISIONING = 'provisioning', // Creating container
  STARTING = 'starting',         // Starting services
  RUNNING = 'running',          // Fully operational
  STOPPING = 'stopping',        // Stopping services
  STOPPED = 'stopped',          // Stopped but not destroyed
  FAILED = 'failed',           // Error state
  TERMINATING = 'terminating', // Cleaning up
}
```

#### Lifecycle Flow

```typescript
async createPod(config: PodConfig): Promise<Pod> {
  // 1. Create container
  const containerId = await this.runtime.createContainer(podId, config);

  // 2. Create network
  const networkId = await this.network.createPodNetwork(podId);

  // 3. Start container
  await this.runtime.startContainer(containerId);

  // 4. Allocate external port
  const proxyPort = await this.network.allocateExternalPort();

  // 5. Setup port forwarding (container :80 → host :proxyPort)
  await this.network.setupPortForwarding(podId, containerId, proxyPort);

  // 6. Install & start services
  await this.provisioner.installServices(containerId, config.services);
  await this.provisioner.startServices(containerId, config.services);

  // 7. Run post-start hooks
  if (config.hooks?.postStart) {
    for (const hook of config.hooks.postStart) {
      await this.runtime.execCommand(containerId, hook);
    }
  }

  return { podId, containerId, proxyPort, status: 'running' };
}
```

**Files**:
- `pod-manager.ts`: Lines 100-400 (Complete lifecycle)

## Testing

### Integration Tests

**Location**: `src/lib/pod-orchestration/__tests__/integration.test.ts`

**Test Coverage**:
- ✅ Container creation with gVisor runtime
- ✅ Network setup with unique bridges
- ✅ Service provisioning (code-server, vibe-kanban, etc.)
- ✅ Hostname-based routing (internal)
- ✅ External access from macOS host (via curl)
- ✅ WebSocket support
- ✅ Template-based pod creation
- ✅ Cleanup and resource management

**Run Tests**:
```bash
# All integration tests
pnpm test:integration

# Specific test
pnpm test:pod-system

# With verbose output
NODE_ENV=development pnpm vitest --config=vitest.config.ts
```

### Test Example: Hostname-Based Routing

```typescript
it('should route requests via hostname-based Nginx proxy', async () => {
  // 1. Create pod with Nginx proxy
  const { podId, containerId, proxyPort } = await podManager.createPod({
    name: 'proxy-test',
    slug: 'test-pod',
    services: []
  });

  // 2. Start test HTTP server on port 8080
  await runtime.execCommand(
    containerId,
    `'mkdir -p /tmp/test-server && echo "Hello!" > /tmp/test-server/index.html && python3 -m http.server 8080 --directory /tmp/test-server'`
  );

  // 3. Test from inside container
  const internal = await runtime.execCommand(
    containerId,
    ['wget', '-O-', 'http://localhost-8080.pod-test.localhost/']
  );
  expect(internal.stdout).toContain('Hello!');

  // 4. Test from macOS host
  const external = await execAsync(
    `curl -s http://localhost-8080.pod-test-pod.localhost:${proxyPort}/`
  );
  expect(external.stdout).toContain('Hello!');
});
```

## Key Implementation Decisions

### 1. Lima VM for macOS Development

**Why**: gVisor requires a Linux kernel, which macOS doesn't provide natively.

**Alternative Considered**: Docker Desktop's virtualization.

**Decision**: Lima VM provides:
- Lightweight Alpine Linux VM (4GB RAM, 8GB disk)
- Native gVisor support
- Automatic port forwarding
- Better performance than Docker Desktop on M1/M2/M3

### 2. Nginx Inside Container (Not External)

**Why**: Dynamic port routing without external service.

**Alternative Considered**: External Nginx/Traefik reverse proxy.

**Decision**: In-container Nginx provides:
- No external dependencies
- Pod-level isolation
- Easy to manage (one Nginx per pod)
- Scales horizontally (each pod independent)

### 3. `.localhost` TLD for Local Dev

**Why**: Avoid `/etc/hosts` modifications requiring sudo.

**Alternative Considered**: `/etc/hosts` patching, custom DNS server.

**Decision**: `.localhost` is:
- Built into all browsers (RFC 8375)
- Automatically resolves to 127.0.0.1
- No DNS configuration needed
- No sudo required
- Works on all platforms

### 4. Single External Port Per Pod

**Why**: Simplify port management and firewall rules.

**Alternative Considered**: Multiple ports per pod (one per service).

**Decision**: Single port provides:
- Fewer port conflicts
- Simpler firewall configuration
- Dynamic service addition (no restart)
- Easier to scale (10,000 pods = 10,000 ports vs. 40,000+)

## Known Issues and Workarounds

### 1. Nginx Permission Issues in gVisor

**Issue**: Nginx couldn't create log/temp directories in `/var/lib/nginx` due to gVisor restrictions.

**Solution**: Changed all Nginx paths to `/tmp/`:
```nginx
error_log /tmp/nginx-error.log;
access_log /tmp/nginx-access.log;
client_body_temp_path /tmp/nginx_client_body;
proxy_temp_path /tmp/nginx_proxy;
# etc.
```

**File**: `docker/config/nginx.conf`

### 2. Code-Server WebSocket Rejection

**Issue**: Code-server rejected WebSocket connections through the proxy with `403 Forbidden`.

**Root Cause**: Origin header mismatch. Browser sends `Origin: http://localhost-8726.pod-test.localhost:30000`, but Nginx was rewriting `Host: localhost:8726`.

**Solution**: Added `--trusted-origins *` flag to code-server:
```typescript
startCommand: ["code-server", "--auth", "none", "--trusted-origins", "*"]
```

**File**: `service-provisioner.ts`, Line 42

### 3. Shell Command Quoting

**Issue**: Commands with `sh -c "command && other"` were failing due to improper quoting.

**Solution**: Caller is responsible for proper quoting:
```typescript
// GOOD: Caller quotes the entire shell command
await execCommand(containerId, ['sh', '-c', "'mkdir -p /tmp && echo hello'"])

// BAD: Let execCommand handle quoting (don't do this)
await execCommand(containerId, ['sh', '-c', 'mkdir -p /tmp && echo hello'])
```

**Decision**: Keep quoting responsibility with the caller for clarity and flexibility.

## Production Considerations

### What's Ready for Production

✅ **Core orchestration**: Pod lifecycle fully implemented
✅ **Networking**: Isolated networks with hostname routing
✅ **Service provisioning**: Multiple services working
✅ **Error handling**: Comprehensive error handling and cleanup
✅ **Testing**: Integration tests covering main flows

### What Needs Work for Production

❌ **Persistence**: Pod state needs to be persisted to database
❌ **Snapshots**: Hibernation/wake functionality not yet implemented
❌ **Monitoring**: Health checks exist but no metrics collection
❌ **Scaling**: Currently single-host, needs multi-host support
❌ **Security**: Need proper authentication/authorization for pod access
❌ **Resource limits**: CPU/memory limits defined but not enforced

### Next Steps

1. **Database Integration**
   - Store pod state in PostgreSQL
   - Track service health and metrics
   - Port allocation tracking

2. **Snapshot System**
   - Implement pod hibernation (save state to S3)
   - Implement pod wake (restore from snapshot)
   - Incremental snapshots for efficiency

3. **Multi-Host Support**
   - Host registration and health tracking
   - Load balancing across hosts
   - Pod migration between hosts

4. **Production Networking**
   - Replace `.localhost` with `.pinacle.dev`
   - SSL/TLS termination at edge
   - Rate limiting and DDoS protection

5. **Monitoring & Observability**
   - Metrics collection (Prometheus)
   - Log aggregation (Loki)
   - Tracing (Jaeger)

## References

- [gVisor Documentation](https://gvisor.dev/)
- [Lima VM Project](https://lima-vm.io/)
- [RFC 8375: .localhost TLD](https://www.rfc-editor.org/rfc/rfc8375.html)
- [Nginx Proxy Configuration](http://nginx.org/en/docs/http/ngx_http_proxy_module.html)

## Conclusion

The pod orchestration system is **fully functional** for local development on macOS via Lima VM. The architecture is designed to scale to production with minimal changes (primarily adding database persistence and multi-host support).

**Key Achievements**:
- ✅ Cross-platform development (macOS + Linux)
- ✅ Secure container isolation (gVisor)
- ✅ Dynamic port routing (Nginx + hostname)
- ✅ Service provisioning (code-server, kanban, etc.)
- ✅ Comprehensive testing (integration tests)
- ✅ Clean architecture (separation of concerns)

**Status**: Ready for next phase (database integration and production deployment).

