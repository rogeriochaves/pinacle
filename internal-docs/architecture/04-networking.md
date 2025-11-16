# Networking Architecture

## Overview

Pinacle uses a simple networking model: each pod gets a dedicated Docker bridge network, a single external port, and hostname-based routing via Nginx for accessing multiple internal services.

**Implementation:** `src/lib/pod-orchestration/network-manager.ts`

## Network Architecture

### Pod Network Topology

```
┌──────────────────────────────────────────────┐
│             Host Machine                      │
│                                               │
│  ┌────────────────────────────────────────┐  │
│  │  Docker Bridge: pinacle-pod-abc        │  │
│  │  Subnet: 10.249.1.0/24                 │  │
│  │                                         │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │  Pod Container                   │  │  │
│  │  │  IP: 10.249.1.2                  │  │  │
│  │  │                                   │  │  │
│  │  │  ┌─────────────────────────────┐ │  │  │
│  │  │  │  Nginx :80                  │ │  │  │
│  │  │  │  (hostname routing)         │ │  │  │
│  │  │  └────────┬────────────────────┘ │  │  │
│  │  │           │                       │  │  │
│  │  │  ┌────────▼────────┐             │  │  │
│  │  │  │  App :3000      │             │  │  │
│  │  │  │  VS Code :8726  │             │  │  │
│  │  │  │  Kanban :3001   │             │  │  │
│  │  │  │  Claude :2528   │             │  │  │
│  │  │  └─────────────────┘             │  │  │
│  │  └──────────────────────────────────┘  │  │
│  │         ▲                                │  │
│  │         │ Port mapping                  │  │
│  │         │ :30000 → :80                  │  │
│  └─────────┼──────────────────────────────┘  │
│            │                                   │
└────────────┼───────────────────────────────────┘
             │
      External Access
   localhost:30000
```

## Network Components

### 1. Docker Bridge Networks

**Implementation:** `NetworkManager.allocateNetwork()` in `network-manager.ts`

Each pod gets a dedicated bridge network:
- **Network name**: `pinacle-pod-<pod-id>`
- **Subnet**: `10.249.X.0/24` (X increments per pod)
- **Gateway**: `10.249.X.1`
- **Container IP**: `10.249.X.2`

**Isolation:** Pods cannot communicate with each other by default (separate networks)

**Creation:**
```bash
docker network create \
  --driver bridge \
  --subnet 10.249.1.0/24 \
  --gateway 10.249.1.1 \
  pinacle-pod-abc123
```

### 2. Port Allocation

**Implementation:** `NetworkManager.allocatePort()` in `network-manager.ts`

Each pod gets a single external port:
- **Range**: 30000-39999 (10,000 pods max)
- **Mapping**: External port → Container port 80
- **Storage**: Stored in `pods.ports` JSON column

**Allocation strategy:**
- Start at 30000
- Increment for each new pod
- Check for conflicts
- Reuse ports from deleted pods

**Port mapping:**
```bash
docker run \
  -p 30000:80 \
  ...
```

### 3. Hostname-Based Routing

**Problem:** Multiple services (app, VS Code, Kanban, etc.) but only one external port

**Solution:** Nginx inside container extracts target port from hostname

**Implementation:** `GVisorRuntime.createContainer()` generates Nginx config in `container-runtime.ts`

**URL format:**
```
http://localhost-<PORT>.pod-<POD-SLUG>.localhost:<EXTERNAL-PORT>
```

**Examples:**
```
http://localhost-3000-pod-test.localhost:30000  → App on :3000
http://localhost-8726-pod-test.localhost:30000  → VS Code on :8726
http://localhost-3001-pod-test.localhost:30000  → Kanban on :3001
```

**Nginx configuration:**
```nginx
    server {
        listen 80 default_server;

    # Extract port from hostname
        set $target_port 3000;
        if ($host ~* ^localhost-(\d+)\..*$) {
            set $target_port $1;
        }

        location / {
            proxy_pass http://127.0.0.1:$target_port;
            proxy_set_header Host localhost:$target_port;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

            # WebSocket support
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 4. Lima VM Port Forwarding

**Problem:** Lima VMs need port forwarding for external access

**Implementation:** `GVisorRuntime` handles both Lima and production in `container-runtime.ts`

Lima automatically forwards ports based on container configuration:
- Container exposes port via `-p 30000:80`
- Lima forwards from host to VM
- User accesses `localhost:30000` on macOS

**Dynamic port retrieval:**
- `getLimaSshPort(vmName)` in `lima-utils.ts`
- Runs `limactl show-ssh <vmName>`
- Parses SSH port from output
- Used for SSH connections

## Service Networking

### Internal Service Communication

Services within a pod communicate via `localhost`:
- App → Database: `postgresql://localhost:5432`
- App → Redis: `redis://localhost:6379`
- All services in same container

**No Docker Compose:** Single container with multiple services via OpenRC

### External Service Access

Services exposed via hostname routing:
- Each service gets a predictable URL
- Tab configuration in `pinacle.yaml`
- Auto-generated tabs for common services

**Tab generation:** `generateDefaultTabs()` in `pinacle-config.ts`

## DNS Resolution

### Internal DNS

Inside container:
- `localhost` → 127.0.0.1 (loopback)
- `host.docker.internal` → Host machine
- Custom DNS (future): Service discovery

### External DNS (Future)

Production domains:
- `<username>-<podname>.pinacle.dev` → Pod
- `<username>-<podname>-<service>.pinacle.dev` → Specific service
- SSL certificates via Let's Encrypt

## Security

### Network Isolation

Pods cannot communicate by default:
- Separate bridge networks
- No shared subnets
- Docker network isolation

**Team pods (future):**
- Shared network for team
- Pod-to-pod communication
- Firewall rules

### Firewall Rules

**Current:** Docker iptables (automatic)

**Future:**
- Explicit inbound/outbound rules
- Rate limiting
- DDoS protection

### SSL/TLS

**Current:** No SSL (localhost only)

**Future:**
- SSL termination at edge
- Let's Encrypt certificates
- Automatic renewal

## Monitoring

**Implementation:** Not yet implemented

**Future:**
- Network traffic metrics
- Bandwidth usage
- Connection counts
- Latency monitoring

## Troubleshooting

### Common Issues

**Port conflict:**
- Check allocated ports in database
- Verify Docker port mappings
- Restart pod with new port

**Network unreachable:**
- Verify bridge network exists
- Check container IP assignment
- Validate Nginx configuration

**Hostname routing not working:**
- Verify URL format
- Check Nginx logs in container
- Test with direct port (if accessible)

**Lima port issues:**
- Verify Lima VM is running
- Check dynamic port via `limactl show-ssh`
- Restart Lima VM if needed

## Performance Considerations

**Network overhead:**
- Nginx proxy adds ~1-5ms latency
- Docker bridge minimal overhead
- Lima SSH adds ~10-20ms (local dev only)

**Optimization:**
- Nginx caching for static assets
- HTTP/2 support
- Connection pooling

**Limitations:**
- One external port per pod
- No pod-to-pod networking (yet)
- Limited to 10,000 pods (port range)

## Related Documentation

- [13-pod-orchestration-implementation.md](./13-pod-orchestration-implementation.md) - Implementation details
- [03-pod-lifecycle.md](./03-pod-lifecycle.md) - Pod lifecycle
- `src/lib/pod-orchestration/network-manager.ts` - Network management code
- `src/lib/pod-orchestration/container-runtime.ts` - Nginx configuration
