/**
 * Pod Recreation Helper
 *
 * Shared logic for recreating a pod container and restoring from snapshot.
 * Used by:
 * - pods.start (when pod was stopped)
 * - snapshots.restore (when manually restoring from a specific snapshot)
 */

import type { db as dbType } from "../../db";
import type { pods } from "../../db/schema";
import type { ServerConnection } from "../../pod-orchestration/types";

type PodRecord = typeof pods.$inferSelect;
type DrizzleDb = typeof dbType;

export type RecreatePodInput = {
  pod: PodRecord;
  serverConnection: ServerConnection;
  snapshotId: string | null; // null means "use latest", string means "use specific snapshot"
  db: DrizzleDb; // Drizzle DB instance
};

export type RecreatePodResult = {
  containerId: string;
  ports: string; // JSON stringified port mappings
};

/**
 * Recreate a pod container and restore from snapshot
 *
 * This function:
 * 1. Removes any existing container
 * 2. Builds pod spec from config
 * 3. Allocates new external ports
 * 4. Creates and starts new container
 * 5. Sets up port forwarding
 * 6. Restores snapshot (latest or specific)
 * 7. Restarts all services
 * 8. Returns containerId and ports for DB update
 */
export const recreatePodWithSnapshot = async ({
  pod,
  serverConnection,
  snapshotId,
  db,
}: RecreatePodInput): Promise<RecreatePodResult> => {
  const { PodManager } = await import("../../pod-orchestration/pod-manager");
  const { GVisorRuntime } = await import(
    "../../pod-orchestration/container-runtime"
  );
  const podManager = new PodManager(pod.id, serverConnection);
  const runtime = new GVisorRuntime(serverConnection);

  // Remove any stale container first
  const container = await podManager.getPodContainer();
  if (container) {
    console.log(
      `[recreatePodWithSnapshot] Removing stale container ${container.id} for pod ${pod.id}`,
    );
    await runtime.removeContainer(container.id);
  }

  // Parse the pod's existing config to get the full spec
  const { podRecordToPinacleConfig, expandPinacleConfigToSpec } = await import(
    "../../pod-orchestration/pinacle-config"
  );

  const pinacleConfig = podRecordToPinacleConfig({
    config: pod.config,
    name: pod.name,
  });

  // Load environment variables from env set if attached
  let environment: Record<string, string> = {};
  if (pod.envSetId) {
    const { envSets } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");

    const [envSet] = await db
      .select()
      .from(envSets)
      .where(eq(envSets.id, pod.envSetId))
      .limit(1);

    if (envSet) {
      environment = JSON.parse(envSet.variables);
    }
  }

  const podSpec = await expandPinacleConfigToSpec(pinacleConfig, {
    id: pod.id,
    name: pod.name,
    slug: pod.slug,
    description: pod.description || undefined,
    environment,
  });

  // Allocate external ports using the same logic as provisioning
  // This mutates podSpec.network.ports to add the nginx-proxy port with external port assignment
  console.log(
    `[recreatePodWithSnapshot] Allocating external ports for pod ${pod.id}`,
  );
  await podManager["allocateExternalPorts"](podSpec);

  // Determine which snapshot to restore and load the image
  const { SnapshotService } = await import("../../snapshots/snapshot-service");
  const snapshotService = new SnapshotService();

  const snapshotIdToRestore =
    snapshotId || (await snapshotService.getLatestSnapshot(pod.id));

  let imageName = podSpec.baseImage; // Default to base image

  if (snapshotIdToRestore) {
    console.log(
      `[recreatePodWithSnapshot] Found snapshot ${snapshotIdToRestore}, restoring volumes...`,
    );

    // Restore the snapshot (restores all volumes, returns base image name)
    imageName = await snapshotService.restoreSnapshot({
      snapshotId: snapshotIdToRestore,
      podId: pod.id,
      serverConnection,
      baseImage: podSpec.baseImage, // Volumes will be restored and mounted automatically
    });

    console.log(
      `[recreatePodWithSnapshot] Snapshot volumes restored, using base image ${imageName}`,
    );
  } else {
    console.log(
      `[recreatePodWithSnapshot] No snapshots found for pod ${pod.id}, using base image`,
    );
  }

  // Create new container from snapshot image (or base image if no snapshot)
  console.log(
    `[recreatePodWithSnapshot] Creating new container from image ${imageName}`,
  );
  const containerSpec = { ...podSpec, baseImage: imageName };
  const newContainer = await runtime.createContainer(containerSpec);

  console.log(
    `[recreatePodWithSnapshot] Created new container ${newContainer.id}`,
  );

  // Start the container
  await runtime.startContainer(newContainer.id);
  console.log(`[recreatePodWithSnapshot] Container ${newContainer.id} started`);

  // Set up port forwarding - same logic as PodManager.createPod()
  console.log(
    `[recreatePodWithSnapshot] Setting up port forwarding for pod ${pod.id}`,
  );
  const { NetworkManager } = await import(
    "../../pod-orchestration/network-manager"
  );
  const networkManager = new NetworkManager(serverConnection);

  for (const port of podSpec.network.ports) {
    if (port.external) {
      await networkManager.setupPortForwarding(pod.id, port);
    }
  }
  console.log(
    `[recreatePodWithSnapshot] Port forwarding configured for pod ${pod.id}`,
  );

  // Start/restart all enabled services
  // Services should auto-start, but we ensure they're running
  if (snapshotIdToRestore) {
    console.log(
      `[recreatePodWithSnapshot] Ensuring services are running after snapshot restore...`,
    );
    for (const service of podSpec.services) {
      if (service.enabled) {
        try {
          // Restart the service to ensure it's running with correct configs
          await runtime.execInContainer(pod.id, newContainer.id, [
            "rc-service",
            service.name,
            "restart",
          ]);
          console.log(
            `[recreatePodWithSnapshot] Restarted service ${service.name}`,
          );
        } catch (error) {
          console.warn(
            `[recreatePodWithSnapshot] Failed to restart service ${service.name}:`,
            error,
          );
        }
      }
    }
    console.log(
      `[recreatePodWithSnapshot] All services restarted`,
    );
  }

  console.log(
    `[recreatePodWithSnapshot] Successfully set up container ${newContainer.id} for pod ${pod.id}`,
  );

  // Return data for DB update
  return {
    containerId: newContainer.id,
    ports: JSON.stringify(podSpec.network.ports),
  };
};
