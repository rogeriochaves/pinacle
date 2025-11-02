/**
 * Snapshot Integration Test
 *
 * Tests snapshot creation and restoration with a real container.
 * Creates a container, writes data, snapshots it, destroys it, restores, and verifies data.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { podSnapshots } from "../../db/schema";
import { SnapshotService } from "../snapshot-service";

const execAsync = promisify(exec);

describe("Snapshot Integration Tests", () => {
  const testPodId = `pod-snapshot-test-${Date.now()}`;
  const testContainerName = `pinacle-pod-${testPodId}`;
  const testFile = "/root/test-data.txt"; // In volume-mounted /root
  const testContent = "Hello from snapshot test!";

  // Mock server connection for Lima
  const serverConnection = {
    exec: async (command: string) => {
      // Execute on Lima VM
      const { stdout, stderr } = await execAsync(
        `limactl shell gvisor-alpine -- ${command}`,
      );
      return { stdout, stderr };
    },
    testConnection: async () => true,
  };

  beforeAll(async () => {
    console.log("[SnapshotTest] Setting up test environment...");

    // Check if Lima VM is running
    try {
      const { stdout } = await execAsync("limactl list --format json");
      const vms = stdout
        .trim()
        .split("\n")
        .map((json) => JSON.parse(json));
      const vm = vms.find(
        (vm) => vm.name === "gvisor-alpine" && vm.status === "Running",
      );

      if (!vm) {
        throw new Error(
          "gVisor-alpine Lima VM is not running. Start it with: limactl start gvisor-alpine",
        );
      }

      console.log("[SnapshotTest] ✅ Lima VM is running");
    } catch (error) {
      console.error("[SnapshotTest] Lima VM check failed:", error);
      throw error;
    }

    // Clean up any existing test containers from previous runs
    try {
      await execAsync(
        `limactl shell gvisor-alpine -- docker rm -f ${testContainerName}`,
      );
    } catch {
      // Ignore if doesn't exist
    }

    // Clean up any restored images from previous runs
    try {
      await execAsync(
        `limactl shell gvisor-alpine -- docker images --format '{{.Repository}}' | grep '^pinacle-restore-' | xargs -r docker rmi -f`,
      );
    } catch {
      // Ignore if none exist
    }

    // Clean up test snapshots from DB from previous runs
    await db.delete(podSnapshots).where(eq(podSnapshots.podId, testPodId));

    // Clean up snapshot files from previous runs
    try {
      await execAsync(
        `limactl shell gvisor-alpine -- find /var/lib/pinacle/snapshots -name 'snapshot_*.tar.gz' -delete`,
      );
    } catch {
      // Ignore if none exist
    }

    console.log("[SnapshotTest] ✅ Test environment ready");
  }, 30_000);

  it("should create a container with test data", async () => {
    console.log("[SnapshotTest] Creating test container with volumes...");

    // First, create volumes for the test pod (simulating real pod setup)
    const volumeTypes = ["workspace", "home", "root", "etc", "usr-local", "opt", "var", "srv"];
    for (const volumeType of volumeTypes) {
      const volumeName = `pinacle-vol-${testPodId}-${volumeType}`;
      await execAsync(
        `limactl shell gvisor-alpine -- docker volume create ${volumeName}`,
      );
    }

    // Create a container with proper pod naming pattern and mounted volumes
    // Use pinacle-pod-<podId> naming pattern to match real pods
    const containerName = `pinacle-pod-${testPodId}`;
    const volumeMounts = volumeTypes
      .map((type) => `-v pinacle-vol-${testPodId}-${type}:/${type === "usr-local" ? "usr/local" : type}`)
      .join(" ");

    const { stdout: containerId } = await execAsync(
      `limactl shell gvisor-alpine -- docker run -d --name ${containerName} ${volumeMounts} alpine:latest sleep infinity`,
    );

    expect(containerId.trim()).toBeTruthy();

    // Write test data to a persisted location (in /root which is mounted)
    const testFileInVolume = "/root/test-data.txt";
    await execAsync(
      `limactl shell gvisor-alpine -- docker exec ${containerName} sh -c "echo '${testContent}' > ${testFileInVolume}"`,
    );

    // Verify data was written
    const { stdout: fileContent } = await execAsync(
      `limactl shell gvisor-alpine -- docker exec ${containerName} cat ${testFileInVolume}`,
    );

    expect(fileContent.trim()).toBe(testContent);

    console.log("[SnapshotTest] ✅ Test container created with data in volumes");
  }, 30_000);

  it("should create a snapshot of the container", async () => {
    console.log("[SnapshotTest] Creating snapshot...");

    const snapshotService = new SnapshotService();

    const snapshotId = await snapshotService.createSnapshot({
      podId: testPodId,
      serverConnection,
      containerId: testContainerName,
      name: "test-snapshot",
      description: "Integration test snapshot",
      isAuto: false,
    });

    expect(snapshotId).toBeTruthy();

    // Verify snapshot was saved in DB
    const [snapshot] = await db
      .select()
      .from(podSnapshots)
      .where(eq(podSnapshots.id, snapshotId))
      .limit(1);

    expect(snapshot).toBeDefined();
    expect(snapshot.podId).toBe(testPodId);
    expect(snapshot.name).toBe("test-snapshot");
    expect(snapshot.status).toBe("ready");
    expect(snapshot.sizeBytes).toBeGreaterThan(0);
    expect(snapshot.storagePath).toBeTruthy();

    console.log(
      `[SnapshotTest] ✅ Snapshot created: ${snapshotId} (${(snapshot.sizeBytes / 1024 / 1024).toFixed(2)} MB)`,
    );
  }, 120_000);

  it("should restore the snapshot after container is destroyed", async () => {
    console.log("[SnapshotTest] Destroying original container...");

    // Remove the original container
    await execAsync(
      `limactl shell gvisor-alpine -- docker rm -f ${testContainerName}`,
    );

    // Verify container is gone
    const { stdout: containerList } = await execAsync(
      `limactl shell gvisor-alpine -- docker ps -a --filter name=${testContainerName} --format '{{.Names}}'`,
    );
    expect(containerList.trim()).toBe("");

    console.log("[SnapshotTest] ✅ Original container destroyed");

    // Get the snapshot ID
    const [snapshot] = await db
      .select()
      .from(podSnapshots)
      .where(eq(podSnapshots.podId, testPodId))
      .limit(1);

    expect(snapshot).toBeDefined();

    console.log("[SnapshotTest] Restoring snapshot...");

    const snapshotService = new SnapshotService();

    // Restore snapshot (restores all volumes)
    const baseImage = await snapshotService.restoreSnapshot({
      snapshotId: snapshot.id,
      podId: testPodId,
      serverConnection,
      baseImage: "alpine:latest",
    });

    expect(baseImage).toBeTruthy();
    expect(baseImage).toBe("alpine:latest");

    console.log(
      `[SnapshotTest] ✅ Snapshot volumes restored`,
    );

    // Create a new container with the same volumes mounted
    const volumeTypes = ["workspace", "home", "root", "etc", "usr-local", "opt", "var", "srv"];
    const volumeMounts = volumeTypes
      .map((type) => `-v pinacle-vol-${testPodId}-${type}:/${type === "usr-local" ? "usr/local" : type}`)
      .join(" ");

    await execAsync(
      `limactl shell gvisor-alpine -- docker run -d --name ${testContainerName} ${volumeMounts} alpine:latest sleep infinity`,
    );

    // Verify the test data is still there in the restored volume
    const { stdout: restoredContent } = await execAsync(
      `limactl shell gvisor-alpine -- docker exec ${testContainerName} cat ${testFile}`,
    );

    expect(restoredContent.trim()).toBe(testContent);

    console.log("[SnapshotTest] ✅ Data successfully restored from snapshot!");
  }, 120_000);

  it("should list all snapshots for the pod", async () => {
    const snapshotService = new SnapshotService();

    const snapshots = await snapshotService.listSnapshots(testPodId);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.podId).toBe(testPodId);
    expect(snapshots[0]?.name).toBe("test-snapshot");

    console.log("[SnapshotTest] ✅ Successfully listed snapshots");
  });

  it("should get the latest snapshot", async () => {
    const snapshotService = new SnapshotService();

    const latestSnapshotId = await snapshotService.getLatestSnapshot(testPodId);

    expect(latestSnapshotId).toBeTruthy();

    const [snapshot] = await db
      .select()
      .from(podSnapshots)
      .where(eq(podSnapshots.id, latestSnapshotId!))
      .limit(1);

    expect(snapshot.podId).toBe(testPodId);

    console.log("[SnapshotTest] ✅ Successfully retrieved latest snapshot");
  });

  it("should delete the snapshot", async () => {
    const snapshotService = new SnapshotService();

    // Get the snapshot ID
    const [snapshot] = await db
      .select()
      .from(podSnapshots)
      .where(eq(podSnapshots.podId, testPodId))
      .limit(1);

    expect(snapshot).toBeDefined();

    // Delete the snapshot
    await snapshotService.deleteSnapshot(snapshot.id, serverConnection);

    // Verify it's deleted from DB
    const [deletedSnapshot] = await db
      .select()
      .from(podSnapshots)
      .where(eq(podSnapshots.id, snapshot.id))
      .limit(1);

    expect(deletedSnapshot).toBeUndefined();

    // Verify the file is deleted from filesystem
    const { stdout: fileExists } = await execAsync(
      `limactl shell gvisor-alpine -- test -f "${snapshot.storagePath}" && echo "exists" || echo "not found"`,
    );

    expect(fileExists.trim()).toBe("not found");

    console.log("[SnapshotTest] ✅ Snapshot successfully deleted");
  }, 30_000);
});
