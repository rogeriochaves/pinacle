/**
 * Auto-Snapshot Integration Test
 *
 * Tests the automatic snapshot creation on pod stop and restoration on pod start.
 * This is the key feature that makes pods stateful across restarts.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { podSnapshots } from "../../db/schema";

const execAsync = promisify(exec);

describe("Auto-Snapshot Integration Tests", () => {
  const testPodId = `pod-auto-test-${Date.now()}`;
  const testContainerId = `container-auto-test-${Date.now()}`;
  const testFile = "/tmp/auto-snapshot-test.txt";
  const testContent = "Auto-snapshot test data!";

  // Mock server connection for Lima
  const serverConnection = {
    exec: async (command: string) => {
      const { stdout, stderr } = await execAsync(
        `limactl shell gvisor-alpine -- ${command}`,
      );
      return { stdout, stderr };
    },
    testConnection: async () => true,
  };

  beforeAll(async () => {
    console.log("[AutoSnapshotTest] Setting up test environment...");

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
      console.log("[AutoSnapshotTest] ✅ Lima VM is running");
    } catch (error) {
      console.error("[AutoSnapshotTest] Lima VM check failed:", error);
      throw error;
    }

    // Clean up any existing test data from previous runs
    await db.delete(podSnapshots).where(eq(podSnapshots.podId, testPodId));

    // Clean up test containers
    try {
      await execAsync(
        `limactl shell gvisor-alpine -- docker rm -f ${testContainerId}`,
      );
    } catch {
      // Ignore if doesn't exist
    }

    // Clean up test snapshot files
    try {
      await execAsync(
        `limactl shell gvisor-alpine -- find /var/lib/pinacle/snapshots -name 'snapshot_*.tar.gz' -delete`,
      );
    } catch {
      // Ignore if none exist
    }

    console.log("[AutoSnapshotTest] ✅ Test environment ready");
  }, 30_000);

  afterAll(async () => {
    console.log("[AutoSnapshotTest] Cleaning up test environment...");

    // Remove test container
    try {
      await execAsync(
        `limactl shell gvisor-alpine -- docker rm -f ${testContainerId}`,
      );
    } catch {
      // Ignore
    }

    // Clean up test data
    await db.delete(podSnapshots).where(eq(podSnapshots.podId, testPodId));

    // Clean up snapshot files
    try {
      await execAsync(
        `limactl shell gvisor-alpine -- find /var/lib/pinacle/snapshots -name 'snapshot_*.tar.gz' -delete`,
      );
    } catch {
      // Ignore
    }

    console.log("[AutoSnapshotTest] ✅ Cleanup complete");
  }, 30_000);

  it("should create auto-snapshot on pod stop", async () => {
    console.log("[AutoSnapshotTest] Testing auto-snapshot on stop...");

    // Create a test container with some data
    const { stdout: containerId } = await execAsync(
      `limactl shell gvisor-alpine -- docker run -d --name ${testContainerId} alpine:latest sleep infinity`,
    );
    expect(containerId.trim()).toBeTruthy();

    // Write test data to container
    await execAsync(
      `limactl shell gvisor-alpine -- docker exec ${testContainerId} sh -c "echo '${testContent}' > ${testFile}"`,
    );

    // Verify data was written
    const { stdout: fileContent } = await execAsync(
      `limactl shell gvisor-alpine -- docker exec ${testContainerId} cat ${testFile}`,
    );
    expect(fileContent.trim()).toBe(testContent);

    console.log("[AutoSnapshotTest] ✅ Test container created with data");

    // Now test the auto-snapshot logic (simulating pod stop)
    const { SnapshotService } = await import("../snapshot-service");
    const snapshotService = new SnapshotService();

    // Create auto-snapshot (this is what happens in pods.stop mutation)
    const timestamp = new Date().toISOString().split("T")[0];
    await snapshotService.createSnapshot({
      podId: testPodId,
      serverConnection,
      containerId: testContainerId,
      name: `auto-${timestamp}`,
      description: "Auto-created on pod stop",
      isAuto: true,
    });

    console.log("[AutoSnapshotTest] ✅ Auto-snapshot created");

    // Verify snapshot was created in DB
    const snapshots = await db
      .select()
      .from(podSnapshots)
      .where(
        and(eq(podSnapshots.podId, testPodId), eq(podSnapshots.isAuto, true)),
      );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.status).toBe("ready");
    expect(snapshots[0]?.name).toContain("auto-");
    expect(snapshots[0]?.sizeBytes).toBeGreaterThan(0);

    console.log(
      `[AutoSnapshotTest] ✅ Auto-snapshot verified: ${snapshots[0]?.name} (${(snapshots[0]?.sizeBytes || 0) / 1024 / 1024} MB)`,
    );

    // Stop the container (what happens after snapshot is created)
    await execAsync(
      `limactl shell gvisor-alpine -- docker stop ${testContainerId}`,
    );

    console.log("[AutoSnapshotTest] ✅ Container stopped");
  }, 120_000);

  it("should restore from latest snapshot on pod start", async () => {
    console.log("[AutoSnapshotTest] Testing auto-restore on start...");

    // At this point, container is stopped and we have a snapshot
    // Simulate pod start: check for latest snapshot and restore

    const { SnapshotService } = await import("../snapshot-service");
    const snapshotService = new SnapshotService();

    // Get latest snapshot (this is what happens in pods.start mutation)
    const latestSnapshotId = await snapshotService.getLatestSnapshot(testPodId);
    expect(latestSnapshotId).toBeTruthy();

    console.log(
      `[AutoSnapshotTest] Found latest snapshot: ${latestSnapshotId}`,
    );

    // Restore the snapshot
    const restoredImageName = await snapshotService.restoreSnapshot({
      snapshotId: latestSnapshotId!,
      podId: testPodId,
      serverConnection,
    });

    expect(restoredImageName).toBeTruthy();
    expect(restoredImageName).toContain("pinacle-restore-");

    console.log(
      `[AutoSnapshotTest] ✅ Snapshot restored to image: ${restoredImageName}`,
    );

    // Remove old container
    try {
      await execAsync(
        `limactl shell gvisor-alpine -- docker rm -f ${testContainerId}`,
      );
    } catch {
      // Ignore
    }

    // Create new container from restored image
    await execAsync(
      `limactl shell gvisor-alpine -- docker run -d --name ${testContainerId} ${restoredImageName} sleep infinity`,
    );

    // Verify the test data is still there
    const { stdout: restoredContent } = await execAsync(
      `limactl shell gvisor-alpine -- docker exec ${testContainerId} cat ${testFile}`,
    );

    expect(restoredContent.trim()).toBe(testContent);

    console.log(
      "[AutoSnapshotTest] ✅ Data successfully restored from auto-snapshot!",
    );
    console.log("[AutoSnapshotTest] 🎉 Pod is now stateful across stop/start!");
  }, 120_000);

  it("should list all snapshots including auto-snapshots", async () => {
    const { SnapshotService } = await import("../snapshot-service");
    const snapshotService = new SnapshotService();

    const allSnapshots = await snapshotService.listSnapshots(testPodId);

    expect(allSnapshots.length).toBeGreaterThan(0);
    expect(allSnapshots.some((s) => s.isAuto)).toBe(true);

    console.log(
      `[AutoSnapshotTest] ✅ Found ${allSnapshots.length} snapshot(s), including auto-snapshots`,
    );
  });

  it("should clean up snapshots when pod is deleted", async () => {
    console.log("[AutoSnapshotTest] Testing snapshot cleanup on pod delete...");

    const { SnapshotService } = await import("../snapshot-service");
    const snapshotService = new SnapshotService();

    // Get all snapshots before cleanup
    const snapshotsBefore = await snapshotService.listSnapshots(testPodId);
    expect(snapshotsBefore.length).toBeGreaterThan(0);

    console.log(
      `[AutoSnapshotTest] Found ${snapshotsBefore.length} snapshot(s) to clean up`,
    );

    // Simulate pod deletion cleanup logic
    for (const snapshot of snapshotsBefore) {
      try {
        await snapshotService.deleteSnapshot(snapshot.id, serverConnection);
        console.log(
          `[AutoSnapshotTest] Deleted snapshot ${snapshot.id} (${snapshot.name})`,
        );
      } catch (error) {
        console.warn(
          `[AutoSnapshotTest] Failed to delete snapshot ${snapshot.id}:`,
          error,
        );
      }
    }

    // Verify all snapshots are deleted from DB
    const snapshotsAfter = await db
      .select()
      .from(podSnapshots)
      .where(eq(podSnapshots.podId, testPodId));

    expect(snapshotsAfter).toHaveLength(0);

    console.log(
      `[AutoSnapshotTest] ✅ All ${snapshotsBefore.length} snapshot(s) cleaned up successfully`,
    );
  }, 60_000);
});
