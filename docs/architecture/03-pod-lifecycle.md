# Pod Lifecycle Management

## Overview

Pod lifecycle management covers the journey from creation to termination, including provisioning, running, and cleanup. The system uses pg-boss for background job processing.

**Implementation:**
- `src/lib/trpc/routers/pods.ts` - API endpoints
- `src/lib/pod-orchestration/pod-provisioning-service.ts` - Provisioning logic
- `src/lib/pod-orchestration/pod-manager.ts` - Container operations

## Lifecycle States

```mermaid
stateDiagram-v2
    [*] --> creating: Create Request
    creating --> running: Provisioning Complete
    creating --> error: Provisioning Failed

    running --> stopped: Stop Request
    running --> error: Crash

    stopped --> running: Start Request
    stopped --> [*]: Delete Request

    error --> creating: Retry
    error --> [*]: Delete
```

## State Definitions

**Database:** `src/lib/db/schema.ts` (`pods.status` column)

| State | Description | Next States |
|-------|-------------|-------------|
| `creating` | Provisioning container, network, services | `running`, `error` |
| `running` | Container running, services healthy | `stopped`, `error` |
| `stopped` | Container stopped, data preserved | `running`, deleted |
| `error` | Provisioning or runtime failure | `creating` (retry), deleted |

## Provisioning Process

### 1. Pod Creation Request

**Endpoint:** `pods.create` in `src/lib/trpc/routers/pods.ts`

Flow:
1. User submits setup form
2. Validate input via Zod schema
3. Generate `PinacleConfig` via `generatePinacleConfigFromForm()`
4. Create pod record in database:
   - `status = "creating"`
   - `config` = JSON of `PinacleConfig`
   - `envVars` = JSON of environment variables
5. Queue provisioning job via pg-boss

**Job name:** `provision-pod`

### 2. Provisioning Job

**Implementation:** `src/lib/pod-orchestration/pod-provisioning-service.ts`

**Job handler:** Background process picks up job and calls `PodProvisioningService.provisionPod()`

Steps:
1. **Load Configuration**
   - Read pod record from database
   - Parse `PinacleConfig` via `podRecordToPinacleConfig()`
   - Derive resources via `getResourcesFromTier()`

2. **Expand to PodSpec**
   - Load template from registry
   - Expand services from registry
   - Merge environment variables
   - Result: Complete `PodSpec` for orchestration

3. **Provision Infrastructure**
   - Allocate network (subnet, gateway, IP)
   - Allocate external port (30000+)
   - Create Docker network
   - Store in `pods.ports` JSON

4. **Create Container**
   - Pull base image
   - Generate Nginx config (hostname routing)
   - Create gVisor container
   - Mount volumes (`/workspace`, `/data`)
   - Set resource limits (CPU, memory)

5. **Clone Repository**
   - Clone GitHub repo via SSH
   - Checkout specified branch
   - Set up SSH keys for private repos

6. **Provision Services**
   - Install each service via `installScript`
   - Create OpenRC service definitions
   - Start services
   - Verify health checks

7. **Inject pinacle.yaml**
   - Serialize `PinacleConfig` to YAML
   - Write to `/workspace/pinacle.yaml`
   - User can commit to version control

8. **Update Status**
   - `status = "running"`
   - `containerId = <docker-id>`
   - `internalIp = <ip>`
   - `lastStartedAt = now()`

**On failure:**
- `status = "error"`
- Clean up partial resources
- Store error message

### 3. Service Startup

**Implementation:** `src/lib/pod-orchestration/service-provisioner.ts`

For each service:
1. Read service definition from registry
2. Execute installation script
3. Create OpenRC service file
4. Start via `rc-service <name> start`
5. Poll health check until healthy (or timeout)

**Health check types:**
- HTTP: GET request to endpoint
- TCP: Socket connection
- Process: Check if process running

**Timeout:** 2 minutes per service

## Running State

### Container Management

**Implementation:** `src/lib/pod-orchestration/pod-manager.ts`

The `PodManager` is instantiated per pod and operates on a single pod:

```typescript
const podManager = new PodManager(podId, serverConnection);

// Operations on the pod
const container = await podManager.getPodContainer();
const logs = await podManager.getPodLogs({ tail: 100 });
const result = await podManager.execInPod(['ls', '-la']);
const isHealthy = await podManager.checkPodHealth();
```

### Health Monitoring

**Not yet implemented**

Future: Health checks, metrics collection, automatic restarts

### Updates

**Changing services:**
1. Update `pods.config` JSON
2. Re-inject `pinacle.yaml`
3. Provision new services (if added)
4. Remove old services (if deleted)

**Changing tier:**
1. Update `pods.config` with new tier
2. Restart container with new resource limits
3. Re-inject `pinacle.yaml`

## Stop/Start

### Stop Pod

**Endpoint:** `pods.stop` (not yet implemented)

**Implementation:** `pod-manager.ts` (`stopPod()` method)

```typescript
const podManager = new PodManager(podId, serverConnection);
await podManager.stopPod();
```

Flow:
1. Get container info via `getPodContainer()`
2. Stop services via `serviceProvisioner.stopService()`
3. Stop container via `containerRuntime.stopContainer()`
4. Emit `stopped` event
5. Update `status = "stopped"` in database

**Data preserved:**
- Container filesystem
- Network configuration
- Database records

### Start Pod

**Endpoint:** `pods.start` (not yet implemented)

**Implementation:** `pod-manager.ts` (`startPod()` method)

```typescript
const podManager = new PodManager(podId, serverConnection);
await podManager.startPod();
```

Flow:
1. Get container info via `getPodContainer()`
2. Check if already running
3. Start container via `containerRuntime.startContainer()`
4. Emit `started` event
5. Update `status = "running"` in database

## Deletion

### Delete Pod

**Endpoint:** `pods.delete` in `src/lib/trpc/routers/pods.ts`

**Implementation:** `pod-manager.ts` (`deletePod()` and `cleanupPodByContainerId()` methods)

```typescript
const podManager = new PodManager(podId, serverConnection);

// Option 1: Delete with known container
await podManager.deletePod();

// Option 2: Cleanup without loading pod (uses container ID from DB)
await podManager.cleanupPodByContainerId(containerId);

// Option 3: Cleanup by finding container
await podManager.cleanupPod();
```

Flow:
1. Get container info via `getPodContainer()`
2. Stop container if running
3. Remove container via `containerRuntime.removeContainer()`
4. Destroy network via `networkManager.destroyPodNetwork()`
5. Release allocated ports via `networkManager.releasePort()`
6. Emit `deleted` event
7. Delete pod record from database

**Cleanup methods:**
- `cleanupPod()` - Finds container by podId, then cleans up
- `cleanupPodByContainerId()` - Cleans up using container ID from database (no in-memory state needed)

**Data lost:**
- Container filesystem (including `/workspace`)
- Service data
- Logs

**Data preserved:**
- Database metadata (audit trail)
- Snapshots (future feature)

## Error Handling

### Provisioning Errors

**Common failures:**
- Network allocation conflict
- Docker container creation failed
- Service installation failed
- Health check timeout
- GitHub clone failed

**Handling:**
1. Set `status = "error"`
2. Store error message in database
3. Clean up partial resources
4. Allow retry via `pods.retry` endpoint (future)

### Runtime Errors

**Common failures:**
- Container crashed
- Service died
- Out of memory
- Disk full

**Handling:**
1. Set `status = "error"`
2. Store error message
3. Stop other services
4. Notify user (future)
5. Allow manual restart

## Background Jobs

**Implementation:** `src/lib/background-jobs/pods.ts` (future)

**Job types:**
- `provision-pod` - Provision new pod
- `start-pod` - Start stopped pod
- `stop-pod` - Stop running pod
- `delete-pod` - Delete pod and clean up

**Job queue:** pg-boss (PostgreSQL-based)

**Concurrency:** 5 concurrent provisioning jobs per server

**Retries:**
- Automatic: 3 retries with exponential backoff
- Manual: User can retry failed provisioning

## Future Enhancements

**Planned features:**

1. **Hibernation/Snapshots**
   - Snapshot container filesystem
   - Store in S3/MinIO
   - Restore from snapshot
   - Save costs when not in use

2. **Auto-stop**
   - Stop pods after inactivity period
   - Configurable timeout
   - Notify before stopping

3. **Health monitoring**
   - Continuous health checks
   - Automatic service restart
   - Alert on failures

4. **Pod migration**
   - Move pod between servers
   - Zero-downtime migration
   - Load balancing

5. **Rollback**
   - Snapshot before changes
   - Rollback to previous state
   - Config history

## Related Documentation

- [pod-config-representations.md](./pod-config-representations.md) - Configuration architecture
- [13-pod-orchestration-implementation.md](./13-pod-orchestration-implementation.md) - Implementation details
- [09-background-jobs.md](./09-background-jobs.md) - Job processing
- [14-server-management-system.md](./14-server-management-system.md) - Server infrastructure
