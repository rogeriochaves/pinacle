# Snapshot System - Volume-Based Architecture

## Overview

The snapshot system captures and restores complete pod state by exporting/importing all Docker volumes. This allows pods to be stopped, backed up, and restored with full data persistence.

**Key Change (Oct 2024)**: Migrated from rootfs-based snapshots to volume-based snapshots to work with the universal volume persistence system.

## Why Volume-Based Snapshots?

With universal volume persistence (see `16-volume-persistence.md`), pod data lives in 8 Docker volumes:
- `/workspace` - User code and files  
- `/home` - User home directory
- `/root` - Root home directory
- `/etc` - System configuration
- `/usr/local` - Locally installed packages
- `/opt` - Optional packages
- `/var` - Variable data (logs, caches)
- `/srv` - Service data

The old approach (`runsc tar rootfs-upper`) only captured filesystem **changes** in the container layer, not volume data. With everything now in volumes, snapshots were empty!

## Architecture

### Snapshot Creation

```
┌─────────────┐
│   Running   │
│  Container  │
└──────┬──────┘
       │
       │ 1. Get pod ID from container name
       ├──────────────────────────────────┐
       │                                  │
       │ 2. For each of 8 volumes:       │
       │    - Export to .tar              │
       ├─────────────────────────────────▶│ /tmp/volumes/
       │      workspace.tar                │   workspace.tar
       │      home.tar                     │   home.tar
       │      root.tar                     │   root.tar
       │      etc.tar                      │   ...
       │      ...                          │
       │                                   │
       │ 3. Create metadata.json           │
       ├─────────────────────────────────▶│   snapshot-metadata.json
       │                                   │
       │ 4. Tar everything                 │
       ├─────────────────────────────────▶│ snapshot.tar
       │                                   │
       │ 5. Compress and upload            │
       ├─────────────────────────────────▶│ snapshot_XYZ.tar.gz
       │                                   │
       ▼                                   ▼
   ┌─────────────┐                  ┌──────────┐
   │ S3/Filesys  │◀─────────────────│  Upload  │
   │   Storage   │                  └──────────┘
   └─────────────┘
```

### Snapshot Restore

```
   ┌─────────────┐
   │ S3/Filesys  │
   │   Storage   │
   └──────┬──────┘
          │
          │ 1. Download snapshot_XYZ.tar.gz
          ▼
     ┌──────────┐
     │ Extract  │
     └────┬─────┘
          │
          │ 2. Extract to /tmp/
          ├────────────────────────────┐
          │                            │
          ▼                            │
    snapshot-metadata.json             │ /tmp/volumes/
    (pod ID, volume list)              │   workspace.tar
                                      │   home.tar
          │                            │   ...
          │                            │
          │ 3. For each volume:        │
          │    - Create/clear volume   │
          │    - Extract tar into it   │
          ├───────────────────────────▶│ Docker volumes restored
          │                            │
          ▼                            ▼
    ┌──────────────┐          ┌────────────────┐
    │ Create       │          │ Volumes ready  │
    │ Container    │◀─────────│ Data restored  │
    │ (base image) │          └────────────────┘
    └──────────────┘
         │
         │ Volumes auto-mounted
         ▼
    ┌──────────────┐
    │  Container   │
    │   Running    │
    │ With restored│
    │     data     │
    └──────────────┘
```

## Implementation

### snapshot-create.ts

Located in `server-agent/src/snapshot-create.ts`, this script runs on the Lima server:

1. **Extract pod ID** from container name (`pinacle-pod-<podId>`)
2. **Export each volume**:
   ```bash
   docker run --rm \
     -v pinacle-vol-<podId>-workspace:/data:ro \
     -v /tmp/volumes:/output \
     alpine:3.22.1 \
     tar -cf /output/workspace.tar -C /data .
   ```
3. **Create metadata** (JSON with pod ID, volume list, timestamp)
4. **Tar everything** (metadata + all volume tars)
5. **Compress** (gzip)
6. **Upload** to S3 or save to filesystem

**Output**: `snapshot_XYZ.tar.gz` containing all pod data

### snapshot-restore.ts

Located in `server-agent/src/snapshot-restore.ts`:

1. **Download** snapshot archive
2. **Extract** to temp directory
3. **Read metadata** to get pod ID and volume list
4. **For each volume**:
   - Create volume if doesn't exist
   - Clear existing data (remove + recreate)
   - Extract tar into volume:
     ```bash
     docker run --rm \
       -v pinacle-vol-<podId>-workspace:/data \
       -v /tmp/volumes:/input:ro \
       alpine:3.22.1 \
       sh -c 'rm -rf /data/* && tar -xf /input/workspace.tar -C /data'
     ```
5. **Return success** (no image needed - volumes are ready)

### SnapshotService

Located in `src/lib/snapshots/snapshot-service.ts`:

**Key change**: `restoreSnapshot()` now:
- Restores volumes (not Docker images)
- Returns the **base image** name (e.g., `alpine:3.22.1`)
- Volumes are already populated and will be auto-mounted when container starts

```typescript
async restoreSnapshot(params: {
  snapshotId: string;
  podId: string;
  serverConnection: ServerConnection;
  baseImage?: string; // Default: alpine:3.22.1
}): Promise<string> {
  // ... restore all volumes ...
  return baseImage; // Return base image to use for container
}
```

### Pod Recreation Flow

Located in `src/lib/trpc/helpers/pod-recreate-helper.ts`:

```typescript
// 1. Get latest snapshot
const snapshotIdToRestore = await snapshotService.getLatestSnapshot(pod.id);

if (snapshotIdToRestore) {
  // 2. Restore volumes
  imageName = await snapshotService.restoreSnapshot({
    snapshotId: snapshotIdToRestore,
    podId: pod.id,
    serverConnection,
    baseImage: podSpec.baseImage, // Just returns this back
  });
}

// 3. Create container from base image
// Volumes are auto-mounted via getUniversalVolumes()
const newContainer = await runtime.createContainer({
  ...podSpec,
  baseImage: imageName, // Base image (e.g., alpine:3.22.1)
});

// Data is already in volumes!
```

## Storage

### Filesystem Storage

Default for development:
- Path: `/var/lib/pinacle/snapshots/`
- Format: `snapshot_<snapshotId>.tar.gz`
- Direct file operations (no API calls)

### S3 Storage

For production:
- Bucket: Configurable via `SNAPSHOT_S3_BUCKET`
- Format: `snapshot_<snapshotId>.tar.gz`
- Uses AWS SDK v3 (`@aws-sdk/client-s3`)
- Supports S3, MinIO, Cloudflare R2, etc.

## Snapshot Lifecycle

### Auto-Snapshots

Created automatically when pods are **stopped** (not paused):

```typescript
// pods.stop mutation
if (pod.status === "running") {
  const timestamp = new Date().toISOString().split("T")[0];
  await snapshotService.createSnapshot({
    podId: pod.id,
    containerId: pod.containerId,
    name: `auto-${timestamp}`,
    isAuto: true,
  });
}
```

### Manual Snapshots

Users can create snapshots anytime via UI:

```typescript
// snapshots.create mutation
await snapshotService.createSnapshot({
  podId: input.podId,
  containerId: pod.containerId,
  name: input.name,
  description: input.description,
  isAuto: false,
});
```

### Snapshot Deletion

Snapshots are deleted:
1. Manually by user
2. When pod is deleted (all snapshots cleaned up)
3. Auto-snapshots when newer ones are created (optional retention policy)

## Comparison: Old vs New

### Old (rootfs-based)

❌ **Broken with volumes**
- Used `runsc tar rootfs-upper` to capture filesystem changes
- Created Docker images with changes baked in
- Didn't capture volume data
- Large snapshot sizes (~200MB)
- Complex image management

### New (volume-based)

✅ **Works with universal volumes**
- Exports all Docker volumes as tars
- No Docker images involved
- Captures **all** data (100% coverage)
- Small snapshot sizes (~150KB for empty pod, ~5-50MB typical)
- Simple tar/untar operations

## Performance

### Snapshot Creation

- **Time**: ~5-10 seconds for typical pod
- **Size**: 5-50MB compressed (depends on data)
- **I/O**: Sequential writes (fast)

### Snapshot Restore

- **Time**: ~10-20 seconds for typical pod
- **Size**: Same as creation
- **I/O**: Sequential reads (fast)

### Storage Impact

- 8 volumes × average pod data
- Compressed with gzip (~10:1 ratio)
- Example: 5GB pod data → ~500MB snapshot

## Testing

Integration tests in `src/lib/snapshots/__tests__/`:

1. **snapshot-integration.test.ts** - Basic snapshot create/restore cycle
2. **auto-snapshot-integration.test.ts** - Auto-snapshot on pod stop

Test setup:
- Creates volumes matching real pod structure
- Uses `pinacle-pod-<podId>` naming pattern
- Writes test data to `/root/test-data.txt`
- Verifies data persists across snapshot/restore

## Troubleshooting

### Snapshot creation fails

Check:
- Container exists and follows naming pattern: `pinacle-pod-<podId>`
- All 8 volumes exist for the pod
- Sufficient disk space in `/tmp` (needs ~2x pod data size)
- Permissions on `/var/lib/pinacle/snapshots/` (filesystem storage)

### Restore fails

Check:
- Snapshot file exists and is accessible
- Pod ID matches snapshot metadata
- Volumes can be created/removed (Docker permissions)
- Sufficient disk space for volume data

### Data missing after restore

- Verify snapshot was created **after** data was written
- Check snapshot size (should be > 0 bytes)
- Verify correct pod ID used for restore
- Check volume mount paths in container creation

## Future Enhancements

1. **Incremental snapshots** - Only snapshot changed volumes
2. **Compression levels** - Trade speed vs size
3. **Encryption** - Encrypt snapshots at rest
4. **Deduplication** - Share common data between snapshots
5. **Parallel export** - Export volumes in parallel for speed
6. **Snapshot scheduling** - Automatic backups on schedule

## Summary

The volume-based snapshot system provides:
- ✅ **100% data coverage** (everything in volumes is captured)
- ✅ **Simple operations** (tar/untar, no image management)
- ✅ **Small snapshots** (~150KB-50MB vs 200MB)
- ✅ **Fast operations** (10-20 seconds typical)
- ✅ **Reliable** (direct volume export/import)

This architecture treats snapshots as **complete backups** of pod state, enabling true "personal VM" behavior with full state preservation.
