# Local Development Environment

## Overview

Since gVisor doesn't run natively on macOS, we use **Lima VM** (Linux virtual machine) to run a lightweight Alpine Linux VM with Docker and gVisor. This allows full testing of pod creation, management, and snapshots locally on macOS while closely mimicking the production environment.

## Architecture

```mermaid
graph TB
    subgraph "macOS Host"
        Next[Next.js Dev<br/>localhost:3000]
        PG[PostgreSQL<br/>localhost:5432]
        Browser[Browser]
    end

    subgraph "Lima VM (Alpine Linux)"
        subgraph "Docker + gVisor"
            Runtime[gVisor Runtime<br/>runsc]
            Pod1[Pod Container 1<br/>Nginx :80 → 30000]
            Pod2[Pod Container 2<br/>Nginx :80 → 30001]
        end
    end

    Next -.-> Runtime
    Runtime --> Pod1
    Runtime --> Pod2
    Browser --> Pod1
    Browser --> Pod2
```

## Lima VM Setup

### Installation

```bash
# Install Lima on macOS
brew install lima

# Start the gVisor-enabled Alpine VM
limactl start gvisor-alpine.yaml

# Verify the VM is running
limactl list

# Check gVisor is available
limactl shell gvisor-alpine -- docker run --rm --runtime=runsc hello-world
```

### Lima Configuration (`gvisor-alpine.yaml`)

The Lima VM is configured with:
- **OS**: Alpine Linux 3.21.3
- **Resources**: 2 CPUs, 4GB RAM, 8GB disk
- **Runtime**: Docker with gVisor (runsc)
- **Networking**: Automatic port forwarding from macOS to VM

Key configuration details:
```yaml
vmType: vz
cpus: 2
memory: 4GiB
disk: 8GiB

provision:
  - mode: system
    script: |
      # Install Docker, containerd, and gVisor
      apk update
      apk add docker containerd curl

      # Download and install runsc (gVisor)
      curl -fsSL https://storage.googleapis.com/gvisor/releases/release/latest/aarch64/runsc -o /usr/local/bin/runsc
      chmod +x /usr/local/bin/runsc

      # Configure Docker daemon for gVisor
      mkdir -p /etc/docker
      cat > /etc/docker/daemon.json <<EOF
      {
        "default-runtime": "runc",
        "runtimes": {
          "runsc": {
            "path": "/usr/local/bin/runsc"
          }
        }
      }
      EOF

      # Start services
      rc-service containerd start
      rc-service docker start
```

## Pod Orchestration System

The pod orchestration system is implemented in TypeScript with the following key classes:

### Core Components

```typescript
// src/lib/pod-orchestration/pod-manager.ts
class PodManager {
  async createPod(spec: PodSpec): Promise<Pod>
  async startPod(podId: string): Promise<void>
  async stopPod(podId: string): Promise<void>
  async deletePod(podId: string): Promise<void>
  async getPodStatus(podId: string): Promise<PodStatus>
}

// src/lib/pod-orchestration/container-runtime.ts
class ContainerRuntime {
  async createContainer(podId: string, spec: PodSpec): Promise<string>
  async startContainer(containerId: string): Promise<void>
  async execCommand(containerId: string, command: string[]): Promise<string>
}

// src/lib/pod-orchestration/network-manager.ts
class NetworkManager {
  async createPodNetwork(podId: string): Promise<string>
  async allocateExternalPort(): Promise<number>
  async setupPortForwarding(podId: string, hostPort: number): Promise<void>
}

// src/lib/pod-orchestration/service-provisioner.ts
class ServiceProvisioner {
  async installService(containerId: string, service: string): Promise<void>
  async startService(containerId: string, service: string): Promise<void>
  async getServiceHealth(containerId: string, service: string): Promise<boolean>
}

// src/lib/pod-orchestration/config-resolver.ts
class ConfigResolver {
  async resolveConfig(source: ConfigSource): Promise<PodSpec>
  async validateConfig(spec: PodSpec): Promise<ValidationResult>
  async mergeConfigs(base: PodSpec, override: PodSpec): Promise<PodSpec>
}
```

### Environment Detection

The system automatically detects the environment and executes commands accordingly:

```typescript
const isDevMode = process.env.NODE_ENV === 'development';

// In development (macOS): commands are prefixed with limactl
// In production (Linux): commands run directly
const execDockerCommand = async (command: string) => {
  if (isDevMode) {
    return execAsync(`limactl shell gvisor-alpine -- ${command}`);
  } else {
    return execAsync(command);
  }
};
```

## Hostname-Based Port Routing

Each pod uses an **internal Nginx proxy** to route requests based on the hostname pattern:

```
localhost-{PORT}.pod-{SLUG}.localhost:{EXPOSED_PORT}
```

### Architecture

```
Browser Request: localhost-8726.pod-test-pod.localhost:30000
    ↓
Lima VM forwards :30000 to container :80
    ↓
Nginx inside container parses "localhost-8726"
    ↓
Nginx proxies to localhost:8726 (code-server)
```

### Nginx Configuration

The Nginx configuration (`docker/config/nginx.conf`) inside each pod:

```nginx
server {
    listen 80 default_server;
    server_name _;

    # Extract port from hostname pattern: localhost-PORT.*
    set $target_port 3000;
    if ($host ~* ^localhost-(\d+)\..*$) {
        set $target_port $1;
    }

    location / {
        # Proxy to localhost:$target_port
        proxy_pass http://127.0.0.1:$target_port;

        # Rewrite Host header to make proxy transparent
        proxy_set_header Host localhost:$target_port;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # Long-running connection support
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;

        # Disable buffering for real-time apps
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
```

### Why `.localhost`?

The `.localhost` TLD is a special-use domain that browsers automatically resolve to `127.0.0.1`, eliminating the need for DNS configuration or `/etc/hosts` modifications during local development.

**Benefits:**
- ✅ No `/etc/hosts` patching required
- ✅ No sudo access needed
- ✅ Works on all browsers
- ✅ No DNS setup
- ✅ Automatic loopback resolution

**Production:** In production, the same pattern is used with `.pinacle.dev` instead of `.localhost`.

## Local Development Scripts

### Start Lima VM

```bash
# Start the gVisor-enabled Lima VM
limactl start gvisor-alpine

# Verify Docker + gVisor are working
limactl shell gvisor-alpine -- docker run --rm --runtime=runsc alpine echo "gVisor works!"
```

### Run Integration Tests

```bash
# Run all pod orchestration tests
pnpm test:integration

# Run specific test suite
pnpm test:pod-system

# Run with verbose output
NODE_ENV=development pnpm vitest --config=vitest.config.ts
```

### Manual Pod Creation

```bash
# Using the PodManager directly
pnpm tsx scripts/create-test-pod.ts

# Or via the integration test
pnpm test:integration -- integration.test.ts -t "should create and start"
```

## Testing Workflow

### 1. Start Lima VM
```bash
limactl start gvisor-alpine
```

### 2. Run Integration Tests
```bash
# Tests will automatically:
# - Create a pod with gVisor runtime
# - Set up networking with unique bridge
# - Install and start services (code-server, vibe-kanban, etc.)
# - Test hostname-based routing
# - Verify WebSocket connections
# - Clean up resources

pnpm test:integration
```

### 3. Access Test Pod Services

After creating a test pod (e.g., with ID `test-pod`), services are accessible via:

```bash
# Code Server (VS Code)
open http://localhost-8726.pod-test-pod.localhost:30000/

# Vibe Kanban
open http://localhost-5262.pod-test-pod.localhost:30000/

# Claude Code
open http://localhost-2528.pod-test-pod.localhost:30000/

# Web Terminal
open http://localhost-7681.pod-test-pod.localhost:30000/
```

**Note:** Port `30000` is the exposed proxy port on the host. The internal services run on their respective ports inside the container, and Nginx routes requests based on the hostname.

### 4. Manual Testing

```bash
# Create a test pod
const manager = new PodManager({
  limaVmName: 'gvisor-alpine',
  baseImage: 'pinacledev/pinacle-base'
});

const podId = await manager.createPod({
  name: 'test-pod',
  slug: 'test-pod',
  services: ['code-server', 'vibe-kanban']
});

# Check pod status
const status = await manager.getPodStatus(podId);
console.log(status);

# Stop pod
await manager.stopPod(podId);

# Cleanup
await manager.deletePod(podId);
```

## Environment Variables

```env
# .env for development
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pinacle

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=development-secret

# GitHub OAuth (create a test app)
GITHUB_CLIENT_ID=your-test-client-id
GITHUB_CLIENT_SECRET=your-test-client-secret

# Pod orchestration
LIMA_VM_NAME=gvisor-alpine
POD_BASE_IMAGE=pinacledev/pinacle-base
POD_PORT_RANGE_START=30000
POD_PORT_RANGE_END=40000
```

**Note:** When `NODE_ENV=development`, all Docker commands are automatically routed through Lima VM using `limactl shell gvisor-alpine --`.

## Debugging

### View Pod Logs
```bash
# View container logs
limactl shell gvisor-alpine -- docker logs <container-id>

# View Nginx logs inside container
limactl shell gvisor-alpine -- docker exec <container-id> cat /tmp/nginx-error.log
limactl shell gvisor-alpine -- docker exec <container-id> cat /tmp/nginx-access.log
```

### Access Pod Shell
```bash
# Get shell access to container
limactl shell gvisor-alpine -- docker exec -it <container-id> sh

# Run commands inside container
limactl shell gvisor-alpine -- docker exec <container-id> ps aux
limactl shell gvisor-alpine -- docker exec <container-id> netstat -tlnp
```

### Check gVisor Status
```bash
# List all runsc containers
limactl shell gvisor-alpine -- docker ps --filter runtime=runsc

# Check gVisor runtime info
limactl shell gvisor-alpine -- runsc --version
```

### Monitor Resource Usage
```bash
# View container stats
limactl shell gvisor-alpine -- docker stats <container-id>

# View network info
limactl shell gvisor-alpine -- docker inspect <container-id> | grep -A 20 NetworkSettings
```

### Test Nginx Proxy
```bash
# Test from inside the container
limactl shell gvisor-alpine -- docker exec <container-id> wget -O- http://localhost-8726.pod-test.localhost/

# Test from macOS host
curl http://localhost-8726.pod-test-pod.localhost:30000/
```

## Known Limitations

1. **Performance**: gVisor in Lima VM has overhead compared to native Linux
2. **Lima Port Forwarding**: Lima automatically forwards container ports to macOS, but there can be slight latency
3. **Resource Usage**: Lima VM reserves 4GB RAM even when pods are idle
4. **Scale**: Can run ~5-10 test pods locally depending on host resources
5. **ARM/x86**: Lima VM runs on ARM (M1/M2/M3) but some Docker images may need ARM builds

## Troubleshooting

### Lima VM Not Starting
```bash
# Check Lima status
limactl list

# Stop and restart
limactl stop gvisor-alpine
limactl start gvisor-alpine

# View Lima logs
limactl shell gvisor-alpine -- dmesg | tail -50
```

### gVisor Not Working
```bash
# Check if runsc is installed
limactl shell gvisor-alpine -- which runsc
limactl shell gvisor-alpine -- runsc --version

# Check Docker daemon configuration
limactl shell gvisor-alpine -- cat /etc/docker/daemon.json

# Test gVisor runtime
limactl shell gvisor-alpine -- docker run --rm --runtime=runsc alpine echo "works"
```

### Docker Permission Issues
```bash
# Fix Docker socket permissions inside Lima
limactl shell gvisor-alpine -- sudo chmod 666 /var/run/docker.sock
```

### Port Conflicts
```bash
# Check what's using ports on macOS
lsof -i :30000
lsof -i :30001

# Lima automatically forwards ports, but you can check:
limactl list --format json | jq '.[].sshLocalPort'
```

### Network Issues
```bash
# Check Docker networks inside Lima
limactl shell gvisor-alpine -- docker network ls
limactl shell gvisor-alpine -- docker network inspect <network-id>

# Test connectivity from container
limactl shell gvisor-alpine -- docker exec <container-id> ping -c 3 8.8.8.8
```

### Clean Everything
```bash
# Remove all test containers and networks
limactl shell gvisor-alpine -- docker rm -f $(docker ps -aq)
limactl shell gvisor-alpine -- docker network prune -f

# Stop and delete Lima VM
limactl stop gvisor-alpine
limactl delete gvisor-alpine

# Recreate from scratch
limactl start gvisor-alpine.yaml
```

### Rebuild Base Image
```bash
# If you make changes to docker/Dockerfile.base or docker/config/nginx.conf:
./docker/build-and-push-base.sh

# Pull into Lima VM
limactl shell gvisor-alpine -- docker pull pinacledev/pinacle-base:latest
```
