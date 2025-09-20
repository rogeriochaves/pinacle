# gVisor Integration for Pinacle

This document outlines the gVisor integration architecture for secure container isolation in Pinacle development environments.

## Overview

gVisor provides application kernel isolation using a user-space kernel that intercepts and handles system calls. This ensures that each Pinacle pod runs in a secure sandbox, protecting both the host system and other pods.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Pinacle Platform                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │    Pod A    │  │    Pod B    │  │    Pod C    │            │
│  │ (Next.js)   │  │  (Mastra)   │  │  (Custom)   │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
├─────────────────────────────────────────────────────────────────┤
│                    gVisor Runtime (runsc)                      │
├─────────────────────────────────────────────────────────────────┤
│                      Docker Engine                             │
├─────────────────────────────────────────────────────────────────┤
│                     Host OS (Linux)                            │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Docker Setup with gVisor

1. **Install gVisor Runtime**
   ```bash
   # Install runsc (gVisor runtime)
   curl -fsSL https://gvisor.dev/archive.key | sudo gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" | sudo tee /etc/apt/sources.list.d/gvisor.list > /dev/null
   sudo apt-get update && sudo apt-get install -y runsc
   ```

2. **Configure Docker Runtime**
   ```json
   // /etc/docker/daemon.json
   {
     "runtimes": {
       "runsc": {
         "path": "/usr/bin/runsc"
       }
     }
   }
   ```

### Phase 2: Pod Container Images

Create optimized container images for each pod type:

#### Base Image (Dockerfile.base)
```dockerfile
FROM ubuntu:22.04

# Install base development tools
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    vim \
    nano \
    htop \
    build-essential \
    python3 \
    python3-pip \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install VS Code Server
RUN curl -fsSL https://code-server.dev/install.sh | sh

# Install Claude Code (placeholder - actual implementation needed)
# RUN curl -fsSL https://claude-code.anthropic.com/install.sh | sh

# Install Vibe Kanban (placeholder - actual implementation needed)
# RUN npm install -g vibe-kanban

# Create workspace directory
WORKDIR /workspace

# Expose common ports
EXPOSE 8080 3000 8000
```

#### Next.js Image (Dockerfile.nextjs)
```dockerfile
FROM pinacle/base:latest

# Install Node.js LTS and pnpm
RUN npm install -g pnpm create-next-app

# Pre-install common dependencies
RUN mkdir -p /tmp/nextjs-template && \
    cd /tmp/nextjs-template && \
    npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --yes && \
    rm -rf /tmp/nextjs-template

EXPOSE 3000 3001
CMD ["code-server", "--bind-addr", "0.0.0.0:8080", "/workspace"]
```

#### Mastra Image (Dockerfile.mastra)
```dockerfile
FROM pinacle/base:latest

# Install Python dependencies for Mastra
RUN pip3 install \
    fastapi \
    uvicorn \
    pydantic \
    httpx \
    python-multipart

# Install Mastra framework (placeholder)
# RUN pip3 install mastra

EXPOSE 8000 8001
CMD ["code-server", "--bind-addr", "0.0.0.0:8080", "/workspace"]
```

### Phase 3: Pod Management API

Create a pod management service that handles container lifecycle:

```typescript
// src/lib/pod-manager.ts
import { Docker } from 'dockerode';

export class PodManager {
  private docker: Docker;

  constructor() {
    this.docker = new Docker();
  }

  async createPod(config: PodConfig): Promise<string> {
    const container = await this.docker.createContainer({
      Image: config.image,
      name: config.name,
      ExposedPorts: this.buildPortConfig(config.ports),
      HostConfig: {
        Runtime: 'runsc', // Use gVisor runtime
        Memory: config.memoryMb * 1024 * 1024,
        CpuQuota: config.cpuCores * 100000,
        PortBindings: this.buildPortBindings(config.ports),
        RestartPolicy: { Name: 'unless-stopped' },
      },
      Env: this.buildEnvConfig(config.env),
      WorkingDir: '/workspace',
    });

    await container.start();
    return container.id;
  }

  async stopPod(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.stop();
  }

  async deletePod(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.remove({ force: true });
  }

  async getPodStatus(containerId: string): Promise<PodStatus> {
    const container = this.docker.getContainer(containerId);
    const info = await container.inspect();

    return {
      status: info.State.Running ? 'running' : 'stopped',
      startedAt: info.State.StartedAt,
      finishedAt: info.State.FinishedAt,
      exitCode: info.State.ExitCode,
    };
  }

  private buildPortConfig(ports: number[]): Record<string, {}> {
    const config: Record<string, {}> = {};
    ports.forEach(port => {
      config[`${port}/tcp`] = {};
    });
    return config;
  }

  private buildPortBindings(ports: number[]): Record<string, Array<{HostPort: string}>> {
    const bindings: Record<string, Array<{HostPort: string}>> = {};
    ports.forEach(port => {
      bindings[`${port}/tcp`] = [{ HostPort: port.toString() }];
    });
    return bindings;
  }

  private buildEnvConfig(env: Record<string, string>): string[] {
    return Object.entries(env).map(([key, value]) => `${key}=${value}`);
  }
}
```

### Phase 4: Security Considerations

1. **Network Isolation**: Each pod runs in its own network namespace
2. **Resource Limits**: CPU and memory limits enforced by Docker
3. **File System Isolation**: gVisor provides secure file system isolation
4. **System Call Filtering**: gVisor intercepts and filters system calls

### Phase 5: Monitoring and Logging

```typescript
// src/lib/pod-monitor.ts
export class PodMonitor {
  async getResourceUsage(containerId: string): Promise<ResourceUsage> {
    const container = docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });

    return {
      cpuPercent: this.calculateCpuPercent(stats),
      memoryUsage: stats.memory_stats.usage,
      memoryLimit: stats.memory_stats.limit,
      networkRx: stats.networks.eth0.rx_bytes,
      networkTx: stats.networks.eth0.tx_bytes,
    };
  }

  async streamLogs(containerId: string): Promise<NodeJS.ReadableStream> {
    const container = docker.getContainer(containerId);
    return container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      timestamps: true,
    });
  }
}
```

## Development Setup (macOS)

For development on macOS, we'll use Docker Desktop with gVisor:

1. **Install Docker Desktop**
2. **Enable gVisor runtime** (when available) or use regular Docker for development
3. **Use Docker Compose** for local development:

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  pod-nextjs:
    build:
      context: .
      dockerfile: docker/Dockerfile.nextjs
    runtime: runsc  # Use gVisor when available
    ports:
      - "3000:3000"
      - "8080:8080"
    volumes:
      - ./workspace:/workspace
    environment:
      - NODE_ENV=development

  pod-mastra:
    build:
      context: .
      dockerfile: docker/Dockerfile.mastra
    runtime: runsc
    ports:
      - "8000:8000"
      - "8081:8080"
    volumes:
      - ./workspace:/workspace
```

## Production Deployment

For production, deploy on Linux servers with proper gVisor setup:

1. **Use managed Kubernetes** with gVisor runtime class
2. **Implement pod scaling** based on resource usage
3. **Set up monitoring** with Prometheus and Grafana
4. **Configure backup** for persistent data

## Testing Strategy

1. **Unit Tests**: Test pod management functions
2. **Integration Tests**: Test full pod lifecycle
3. **Security Tests**: Verify isolation between pods
4. **Performance Tests**: Measure overhead of gVisor
5. **Load Tests**: Test multiple concurrent pods

This architecture provides a secure, scalable foundation for Pinacle's development environments while maintaining the flexibility needed for various use cases.

