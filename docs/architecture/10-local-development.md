# Local Development Environment

## Overview

Since gVisor doesn't run natively on macOS, we use Docker Desktop with a Linux container to simulate the production environment. This allows full testing of pod creation, management, and snapshots locally.

## Architecture

```mermaid
graph TB
    subgraph "macOS Host"
        Next[Next.js Dev<br/>localhost:3000]
        PG[PostgreSQL<br/>localhost:5432]
        Minio[MinIO<br/>localhost:9000]
    end

    subgraph "Docker Desktop"
        subgraph "Pod Host Container"
            gVisor[gVisor Runtime]
            Agent[Pod Agent<br/>:8080]
            Pod1[Test Pod 1]
            Pod2[Test Pod 2]
        end
    end

    Next --> Agent
    Agent --> gVisor
    Agent --> Minio
    Next --> PG
```

## Docker Compose Setup

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  # PostgreSQL with pg-boss
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: pinacle
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # MinIO for snapshot storage
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"    # S3 API
      - "9001:9001"    # Web console
    volumes:
      - minio_data:/data

  # Simulated pod host with gVisor
  pod-host:
    build:
      context: ./docker/dev
      dockerfile: Dockerfile.pod-host
    privileged: true  # Required for gVisor
    ports:
      - "8080:8080"    # Pod management API
      - "30000-30100:30000-30100"  # Pod service ports
    environment:
      - MINIO_ENDPOINT=http://minio:9000
      - MINIO_ACCESS_KEY=minioadmin
      - MINIO_SECRET_KEY=minioadmin
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - pod_data:/var/pods

volumes:
  postgres_data:
  minio_data:
  pod_data:
```

## Pod Host Container

```dockerfile
# docker/dev/Dockerfile.pod-host
FROM ubuntu:22.04

# Install base dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    nodejs \
    npm \
    python3 \
    python3-pip \
    docker.io \
    iptables \
    iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Install gVisor
RUN curl -fsSL https://gvisor.dev/archive.key | apt-key add - && \
    echo "deb https://storage.googleapis.com/gvisor/releases release main" > /etc/apt/sources.list.d/gvisor.list && \
    apt-get update && \
    apt-get install -y runsc

# Configure Docker for gVisor
RUN mkdir -p /etc/docker && \
    echo '{"runtimes":{"runsc":{"path":"/usr/bin/runsc"}}}' > /etc/docker/daemon.json

# Install MinIO client
RUN wget https://dl.min.io/client/mc/release/linux-amd64/mc && \
    chmod +x mc && \
    mv mc /usr/local/bin/

# Copy management scripts
COPY scripts/ /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh

# Install pod agent
WORKDIR /opt/pod-agent
COPY pod-agent/package.json .
RUN npm install
COPY pod-agent/index.js .

# Start agent
CMD ["node", "index.js"]
```

## Pod Management Agent

```javascript
// docker/dev/pod-agent/index.js
const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
app.use(express.json());

// Create pod
app.post('/create-pod', async (req, res) => {
  const { podId, config } = req.body;

  try {
    // Create pod with gVisor
    const { stdout } = await execAsync(`
      docker run -d \
        --name pod-${podId} \
        --runtime runsc \
        --memory ${config.memory} \
        --cpus ${config.cpu} \
        --network pinacle \
        -v /var/pods/${podId}:/workspace \
        ubuntu:22.04 \
        sleep infinity
    `);

    // Get pod IP
    const { stdout: ip } = await execAsync(`
      docker inspect pod-${podId} | grep IPAddress | head -1 | awk '{print $2}' | tr -d ',"'
    `);

    res.json({
      success: true,
      containerId: stdout.trim(),
      internalIp: ip.trim()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop pod
app.post('/stop-pod', async (req, res) => {
  const { podId } = req.body;

  try {
    await execAsync(`docker stop pod-${podId}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete pod
app.post('/delete-pod', async (req, res) => {
  const { podId } = req.body;

  try {
    await execAsync(`docker rm -f pod-${podId}`);
    await execAsync(`rm -rf /var/pods/${podId}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Pod agent listening on port ${PORT}`);
});
```

## Local Development Scripts

### Start Development Environment

```bash
#!/bin/bash
# scripts/dev-start.sh

echo "Starting Pinacle development environment..."

# Start Docker services
docker-compose -f docker-compose.dev.yml up -d

# Wait for services
echo "Waiting for services to be ready..."
sleep 5

# Initialize MinIO buckets
docker-compose exec minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker-compose exec minio mc mb local/pinacle-snapshots

# Run database migrations
npm run db:migrate

# Seed database with test data
npm run db:seed

echo "Development environment ready!"
echo "- Next.js: http://localhost:3000"
echo "- PostgreSQL: localhost:5432"
echo "- MinIO: http://localhost:9001"
echo "- Pod Host API: http://localhost:8080"
```

### Create Test Pod

```bash
#!/bin/bash
# scripts/create-test-pod.sh

POD_ID="test-$(date +%s)"

curl -X POST http://localhost:8080/create-pod \
  -H "Content-Type: application/json" \
  -d '{
    "podId": "'$POD_ID'",
    "config": {
      "tier": "dev.small",
      "cpu": "0.5",
      "memory": "1g"
    }
  }'

echo "Created pod: $POD_ID"
```

## Testing Workflow

### 1. Start Environment
```bash
npm run dev:start
```

### 2. Create a Pod via API
```typescript
// In your Next.js app
const response = await fetch('/api/pods', {
  method: 'POST',
  body: JSON.stringify({
    name: 'my-test-pod',
    tier: 'dev.small',
    repository: 'https://github.com/user/repo'
  })
});
```

### 3. Access Pod Services
```bash
# Pod services available at:
# http://localhost:30000 - User app
# http://localhost:30001 - Vibe Kanban
# http://localhost:30002 - Code Server
```

### 4. Test Snapshot
```bash
# Create snapshot
curl -X POST http://localhost:8080/snapshot/test-pod-123

# Stop pod
curl -X POST http://localhost:8080/stop-pod \
  -d '{"podId":"test-pod-123"}'

# Restore from snapshot
curl -X POST http://localhost:8080/restore-pod \
  -d '{"podId":"test-pod-123","snapshotId":"snap-123"}'
```

## Environment Variables

```env
# .env.local for development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pinacle
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=development-secret

# GitHub OAuth (create a test app)
GITHUB_CLIENT_ID=your-test-client-id
GITHUB_CLIENT_SECRET=your-test-client-secret

# Pod host (Docker container)
POD_HOST_URL=http://localhost:8080
POD_HOST_API_KEY=development-key

# S3/MinIO
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=pinacle-snapshots
```

## Debugging

### View Pod Logs
```bash
docker logs pod-test-123
```

### Access Pod Shell
```bash
docker exec -it pod-test-123 bash
```

### Check gVisor Status
```bash
docker exec pod-host runsc --root /var/run/runsc list
```

### Monitor Resource Usage
```bash
docker stats pod-test-123
```

## Known Limitations

1. **Performance**: gVisor in Docker is slower than production
2. **Networking**: Simplified networking compared to production
3. **Storage**: Uses Docker volumes instead of dedicated storage
4. **Scale**: Can only run a few pods locally

## Troubleshooting

### gVisor Not Working
```bash
# Check if Docker supports custom runtimes
docker info | grep Runtime

# Restart Docker daemon
sudo systemctl restart docker
```

### Port Conflicts
```bash
# Check what's using ports
lsof -i :3000
lsof -i :5432
lsof -i :9000
```

### Clean Everything
```bash
# Stop and remove all containers
docker-compose -f docker-compose.dev.yml down -v

# Clean pod data
rm -rf docker/dev/pod_data/*
```
