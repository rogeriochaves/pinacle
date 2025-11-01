import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { pods } from "../db/schema";
import { PodManager } from "../pod-orchestration/pod-manager";
import { PodProvisioningService } from "../pod-orchestration/pod-provisioning-service";

/**
 * Pod suspension logic for billing enforcement
 * Suspends/deletes pods when payment fails or subscription cancelled
 */

/**
 * Suspend all running pods for a user
 */
export const suspendUserPods = async (userId: string): Promise<void> => {
  console.log(`[PodSuspension] Suspending all pods for user ${userId}`);

  // Get all running pods for user
  const runningPods = await db
    .select()
    .from(pods)
    .where(and(eq(pods.ownerId, userId), eq(pods.status, "running")));

  console.log(`[PodSuspension] Found ${runningPods.length} running pods to suspend`);

  const provisioningService = new PodProvisioningService();

  for (const pod of runningPods) {
    try {
      if (!pod.serverId) {
        console.log(`[PodSuspension]   ⊘ Pod ${pod.id} has no server, skipping`);
        continue;
      }

      // Get server connection details (handles Lima VMs automatically)
      const serverConnection = await provisioningService.getServerConnectionDetails(
        pod.serverId,
      );

      // Stop the pod
      const podManager = new PodManager(pod.id, serverConnection);
      await podManager.stopPod();

      // Update database status
      await db
        .update(pods)
        .set({ status: "stopped", lastStoppedAt: new Date(), updatedAt: new Date() })
        .where(eq(pods.id, pod.id));

      console.log(`[PodSuspension]   ✓ Suspended pod ${pod.id}`);
    } catch (error) {
      console.error(`[PodSuspension]   ✗ Failed to suspend pod ${pod.id}:`, error);
    }
  }

  console.log(`[PodSuspension] Completed pod suspension for user ${userId}`);
};

/**
 * Resume all stopped pods for a user (when payment is successful)
 */
export const resumeUserPods = async (userId: string): Promise<void> => {
  console.log(`[PodSuspension] Resuming pods for user ${userId}`);

  // Get all stopped pods for user (not archived)
  const stoppedPods = await db
    .select()
    .from(pods)
    .where(
      and(
        eq(pods.ownerId, userId),
        eq(pods.status, "stopped"),
        isNull(pods.archivedAt),
      ),
    );

  console.log(`[PodSuspension] Found ${stoppedPods.length} stopped pods to resume`);

  const provisioningService = new PodProvisioningService();

  for (const pod of stoppedPods) {
    try {
      if (!pod.serverId) {
        console.log(`[PodSuspension]   ⊘ Pod ${pod.id} has no server, skipping`);
        continue;
      }

      // Get server connection details (handles Lima VMs automatically)
      const serverConnection = await provisioningService.getServerConnectionDetails(
        pod.serverId,
      );

      // Start the pod
      const podManager = new PodManager(pod.id, serverConnection);
      await podManager.startPod();

      // Update database status
      await db
        .update(pods)
        .set({ status: "running", lastStartedAt: new Date(), updatedAt: new Date() })
        .where(eq(pods.id, pod.id));

      // Track initial 1-hour usage for this resume
      try {
        const { usageTracker } = await import("./usage-tracker");
        const { podRecordToPinacleConfig } = await import(
          "../pod-orchestration/pinacle-config"
        );
        const config = podRecordToPinacleConfig({
          config: pod.config,
          name: pod.name,
        });
        await usageTracker.trackInitialPodUsage(
          pod.id,
          pod.ownerId,
          config.tier,
        );
        console.log(`[PodSuspension]   ✓ Tracked initial usage for pod ${pod.id}`);
      } catch (error) {
        console.error(
          `[PodSuspension]   ✗ Failed to track initial usage for pod ${pod.id}:`,
          error,
        );
      }

      console.log(`[PodSuspension]   ✓ Resumed pod ${pod.id}`);
    } catch (error) {
      console.error(`[PodSuspension]   ✗ Failed to resume pod ${pod.id}:`, error);
    }
  }

  console.log(`[PodSuspension] Completed pod resumption for user ${userId}`);
};

/**
 * Delete all pods for a user (after grace period expires)
 */
export const deleteUserPods = async (userId: string): Promise<void> => {
  console.log(`[PodSuspension] Deleting all pods for user ${userId}`);

  // Get all non-archived pods for user
  const userPods = await db
    .select()
    .from(pods)
    .where(and(eq(pods.ownerId, userId), isNull(pods.archivedAt)));

  console.log(`[PodSuspension] Found ${userPods.length} pods to delete`);

  const provisioningService = new PodProvisioningService();

  for (const pod of userPods) {
    try {
      // If pod is running, stop it first
      if (pod.status === "running" && pod.serverId) {
        // Get server connection details (handles Lima VMs automatically)
        const serverConnection = await provisioningService.getServerConnectionDetails(
          pod.serverId,
        );

        const podManager = new PodManager(pod.id, serverConnection);
        await podManager.stopPod();
      }

      // Archive the pod (soft delete)
      await db
        .update(pods)
        .set({
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pods.id, pod.id));

      console.log(`[PodSuspension]   ✓ Archived pod ${pod.id}`);
    } catch (error) {
      console.error(`[PodSuspension]   ✗ Failed to archive pod ${pod.id}:`, error);
    }
  }

  console.log(`[PodSuspension] Completed pod deletion for user ${userId}`);
};
