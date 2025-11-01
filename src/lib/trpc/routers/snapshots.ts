/**
 * Snapshots tRPC Router
 *
 * Provides endpoints for managing pod snapshots:
 * - list: Get all snapshots for a pod
 * - create: Create a new snapshot of a running pod
 * - restore: Restore a pod from a snapshot
 * - delete: Delete a snapshot
 */

import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { db as dbType } from "../../db";
import { podSnapshots, pods, teamMembers } from "../../db/schema";
import { SnapshotService } from "../../snapshots/snapshot-service";
import { createTRPCRouter, protectedProcedure } from "../server";

type DrizzleDb = typeof dbType;

type Context = {
  db: DrizzleDb;
  session: { user: { id: string } };
};

const getUserPodOrThrow = async (ctx: Context, podId: string) => {
  const userId = ctx.session.user.id;

  // Get pod and verify user has access through team membership
  const [pod] = await ctx.db
    .select({ pod: pods })
    .from(pods)
    .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
    .where(and(eq(pods.id, podId), eq(teamMembers.userId, userId)))
    .limit(1);

  if (!pod) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Pod not found",
    });
  }

  return pod.pod;
};

export const snapshotsRouter = createTRPCRouter({
  /**
   * List all snapshots for a pod
   */
  list: protectedProcedure
    .input(
      z.object({
        podId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify user has access to the pod
      await getUserPodOrThrow(ctx, input.podId);

      // Get all snapshots for this pod
      const snapshots = await ctx.db
        .select()
        .from(podSnapshots)
        .where(eq(podSnapshots.podId, input.podId))
        .orderBy(desc(podSnapshots.createdAt));

      return snapshots;
    }),

  /**
   * Create a new snapshot
   */
  create: protectedProcedure
    .input(
      z.object({
        podId: z.string(),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user has access to the pod
      const pod = await getUserPodOrThrow(ctx, input.podId);

      if (pod.status !== "running") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pod must be running to create a snapshot",
        });
      }

      if (!pod.containerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pod does not have a container ID",
        });
      }

      if (!pod.serverId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pod is not assigned to a server",
        });
      }

      // Get server connection details
      const { PodProvisioningService } = await import(
        "../../pod-orchestration/pod-provisioning-service"
      );
      const provisioningService = new PodProvisioningService();
      const serverConnection = await provisioningService[
        "getServerConnectionDetails"
      ](pod.serverId);

      // Create snapshot asynchronously
      const snapshotService = new SnapshotService();

      try {
        const snapshotId = await snapshotService.createSnapshot({
          podId: input.podId,
          serverConnection,
          containerId: pod.containerId,
          name: input.name,
          description: input.description,
          isAuto: false,
        });

        return { snapshotId };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create snapshot: ${errorMessage}`,
        });
      }
    }),

  /**
   * Delete a snapshot
   */
  delete: protectedProcedure
    .input(
      z.object({
        snapshotId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Get snapshot with pod ownership check via team membership
      const [snapshot] = await ctx.db
        .select({
          snapshot: podSnapshots,
          pod: pods,
        })
        .from(podSnapshots)
        .innerJoin(pods, eq(podSnapshots.podId, pods.id))
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .where(
          and(
            eq(podSnapshots.id, input.snapshotId),
            eq(teamMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!snapshot) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Snapshot not found",
        });
      }

      if (!snapshot.pod.serverId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pod does not have a server ID",
        });
      }

      // Get server connection details
      const { PodProvisioningService } = await import(
        "../../pod-orchestration/pod-provisioning-service"
      );
      const provisioningService = new PodProvisioningService();
      const serverConnection = await provisioningService[
        "getServerConnectionDetails"
      ](snapshot.pod.serverId);

      try {
        const snapshotService = new SnapshotService();
        await snapshotService.deleteSnapshot(
          input.snapshotId,
          serverConnection,
        );

        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete snapshot: ${errorMessage}`,
        });
      }
    }),

  /**
   * Restore a pod from a specific snapshot
   * This will stop the pod, remove the container, and recreate it from the snapshot
   */
  restore: protectedProcedure
    .input(
      z.object({
        snapshotId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Get snapshot with pod ownership check via team membership
      const [snapshot] = await ctx.db
        .select({
          snapshot: podSnapshots,
          pod: pods,
        })
        .from(podSnapshots)
        .innerJoin(pods, eq(podSnapshots.podId, pods.id))
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .where(
          and(
            eq(podSnapshots.id, input.snapshotId),
            eq(teamMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!snapshot) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Snapshot not found",
        });
      }

      const pod = snapshot.pod;

      if (!pod.serverId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pod is not assigned to a server",
        });
      }

      try {
        // Get server connection
        const { PodProvisioningService } = await import(
          "../../pod-orchestration/pod-provisioning-service"
        );
        const provisioningService = new PodProvisioningService();
        const serverConnection = await provisioningService[
          "getServerConnectionDetails"
        ](pod.serverId);

        // Stop the pod if it's running
        if (pod.status === "running") {
          const { PodManager } = await import(
            "../../pod-orchestration/pod-manager"
          );
          const podManager = new PodManager(pod.id, serverConnection);
          await podManager.stopPod();
        }

        // Use shared helper to recreate pod with specific snapshot
        const { recreatePodWithSnapshot } = await import(
          "../helpers/pod-recreate-helper"
        );

        const result = await recreatePodWithSnapshot({
          pod,
          serverConnection,
          snapshotId: input.snapshotId, // Restore from specific snapshot
          db: ctx.db,
        });

        // Update pod status to running with new container and ports
        await ctx.db
          .update(pods)
          .set({
            status: "running",
            containerId: result.containerId,
            ports: result.ports, // Update ports for proxy routing
            lastStartedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(pods.id, pod.id));

        // Track initial 1-hour usage for this restore
        try {
          const { usageTracker } = await import("../../billing/usage-tracker");
          const { podRecordToPinacleConfig } = await import(
            "../../pod-orchestration/pinacle-config"
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
          console.log(
            `[snapshots.restore] Tracked initial usage for pod ${pod.id}`,
          );
        } catch (error) {
          console.error(
            `[snapshots.restore] Failed to track initial usage for pod ${pod.id}:`,
            error,
          );
        }

        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // Update pod to error state
        await ctx.db
          .update(pods)
          .set({
            status: "error",
            lastErrorMessage: `Restore failed: ${errorMessage}`,
            updatedAt: new Date(),
          })
          .where(eq(pods.id, pod.id));

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to restore snapshot: ${errorMessage}`,
        });
      }
    }),

  /**
   * Get latest snapshot for a pod
   */
  getLatest: protectedProcedure
    .input(
      z.object({
        podId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify user has access to the pod
      await getUserPodOrThrow(ctx, input.podId);

      const snapshotService = new SnapshotService();
      const latestSnapshotId = await snapshotService.getLatestSnapshot(
        input.podId,
      );

      if (!latestSnapshotId) {
        return null;
      }

      const [snapshot] = await ctx.db
        .select()
        .from(podSnapshots)
        .where(eq(podSnapshots.id, latestSnapshotId))
        .limit(1);

      return snapshot || null;
    }),
});
