import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db";
import { pods } from "../db/schema";
import { PodManager } from "../pod-orchestration/pod-manager";

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

  for (const pod of runningPods) {
    try {
      // Stop the pod
      const podManager = new PodManager(pod.id);
      await podManager.stop();

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

  for (const pod of stoppedPods) {
    try {
      // Start the pod
      const podManager = new PodManager(pod.id);
      await podManager.start();

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

  for (const pod of userPods) {
    try {
      // Archive the pod (soft delete)
      await db
        .update(pods)
        .set({
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pods.id, pod.id));

      // If pod is running, stop it first
      if (pod.status === "running") {
        const podManager = new PodManager(pod.id);
        await podManager.stop();
      }

      console.log(`[PodSuspension]   ✓ Archived pod ${pod.id}`);
    } catch (error) {
      console.error(`[PodSuspension]   ✗ Failed to archive pod ${pod.id}:`, error);
    }
  }

  console.log(`[PodSuspension] Completed pod deletion for user ${userId}`);
};

/**
 * Check and enforce grace period expiration
 * Run periodically by worker (daily)
 */
export const enforceGracePeriod = async (): Promise<void> => {
  console.log("[PodSuspension] Checking grace period expiration...");

  // Grace period is 7 days
  const GRACE_PERIOD_DAYS = 7;
  const gracePeriodExpiry = new Date(
    Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );

  // This would need to query stripeCustomers table
  // For now, this is a placeholder
  // TODO: Implement grace period enforcement query

  console.log("[PodSuspension] Grace period enforcement complete");
};

