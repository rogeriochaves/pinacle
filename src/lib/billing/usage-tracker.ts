import { eq } from "drizzle-orm";
import { db } from "../db";
import { podSnapshots, pods, stripeCustomers, usageRecords } from "../db/schema";
import type { TierId } from "../pod-orchestration/resource-tier-registry";
import { stripe } from "../stripe";
import { generateKSUID } from "../utils";

/**
 * Usage tracker for pod runtime billing
 * Tracks hourly usage and reports to Stripe
 */
export class UsageTracker {
  /**
   * Track pod runtime for all running pods
   * Called every hour by the worker
   */
  async trackPodRuntime(): Promise<void> {
    console.log("[UsageTracker] Starting hourly pod runtime tracking...");

    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get all running pods
    const runningPods = await db
      .select()
      .from(pods)
      .where(eq(pods.status, "running"));

    console.log(`[UsageTracker] Found ${runningPods.length} running pods`);

    for (const pod of runningPods) {
      try {
        // Parse pod config to get tier
        const config = JSON.parse(pod.config);
        const tierId = config.tier as TierId;

        // Create usage record
        const usageRecord = await db
          .insert(usageRecords)
          .values({
            id: generateKSUID("usage_record"),
            userId: pod.ownerId,
            podId: pod.id,
            tierId: tierId,
            recordType: "runtime",
            quantity: 1.0, // 1 hour
            periodStart: hourAgo,
            periodEnd: now,
            reportedToStripe: false,
            createdAt: new Date(),
          })
          .returning();

        console.log(
          `[UsageTracker]   ✓ Created usage record for pod ${pod.id}`,
        );

        // Report to Stripe immediately
        await this.reportUsageToStripe(usageRecord[0]);
      } catch (error) {
        console.error(
          `[UsageTracker]   ✗ Failed to track usage for pod ${pod.id}:`,
          error,
        );
      }
    }

    console.log("[UsageTracker] Completed hourly tracking");
  }

  /**
   * Track snapshot storage for all snapshots
   * Called every hour by the worker
   */
  async trackSnapshotStorage(): Promise<void> {
    console.log("[UsageTracker] Starting hourly snapshot storage tracking...");

    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get all ready snapshots (not in creating/failed state)
    const snapshots = await db
      .select()
      .from(podSnapshots)
      .where(eq(podSnapshots.status, "ready"));

    console.log(`[UsageTracker] Found ${snapshots.length} snapshots`);

    // Group snapshots by user (podId doesn't have FK so we need to join through pods)
    // Actually, we can't join since pod may be deleted. Need to track userId in snapshots
    // For now, let's query pods to get userId for each snapshot

    const snapshotsWithUser = await Promise.all(
      snapshots.map(async (snapshot) => {
        // Try to find pod to get userId
        const [pod] = await db
          .select()
          .from(pods)
          .where(eq(pods.id, snapshot.podId))
          .limit(1);

        return {
          snapshot,
          userId: pod?.ownerId || null,
        };
      })
    );

    // Filter out snapshots without user (orphaned)
    const validSnapshots = snapshotsWithUser.filter((s) => s.userId !== null);

    for (const { snapshot, userId } of validSnapshots) {
      try {
        // Calculate MB from bytes
        const storageMb = snapshot.sizeBytes / 1024 / 1024;

        // Create usage record for 1 hour of storage
        const usageRecord = await db
          .insert(usageRecords)
          .values({
            id: generateKSUID("usage_record"),
            userId: userId!,
            podId: snapshot.podId,
            tierId: "snapshot_storage", // Special tier for snapshots
            recordType: "storage",
            quantity: storageMb, // MB-hours (MB stored for 1 hour)
            periodStart: hourAgo,
            periodEnd: now,
            reportedToStripe: false,
            createdAt: new Date(),
          })
          .returning();

        console.log(
          `[UsageTracker]   ✓ Created storage record for snapshot ${snapshot.id} (${storageMb.toFixed(2)} MB)`,
        );

        // Report to Stripe immediately
        await this.reportSnapshotUsageToStripe(usageRecord[0]);
      } catch (error) {
        console.error(
          `[UsageTracker]   ✗ Failed to track storage for snapshot ${snapshot.id}:`,
          error,
        );
      }
    }

    console.log("[UsageTracker] Completed hourly snapshot storage tracking");
  }

  /**
   * Report snapshot storage usage to Stripe using Billing Meters
   */
  async reportSnapshotUsageToStripe(
    usageRecord: typeof usageRecords.$inferSelect,
  ): Promise<void> {
    try {
      // Get customer record
      const customer = await db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.userId, usageRecord.userId))
        .limit(1);

      if (customer.length === 0) {
        console.log(
          `[UsageTracker] No Stripe customer for user ${usageRecord.userId}`,
        );
        return;
      }

      const stripeCustomer = customer[0];

      if (!stripeCustomer.stripeSubscriptionId) {
        console.log(
          `[UsageTracker] No subscription for user ${usageRecord.userId}`,
        );
        return;
      }

      // Report usage to Stripe using Billing Meters
      const meterEvent = await stripe.billing.meterEvents.create({
        event_name: "snapshot_storage",
        timestamp: Math.floor(usageRecord.periodEnd.getTime() / 1000),
        identifier: usageRecord.id, // For idempotency
        payload: {
          stripe_customer_id: stripeCustomer.stripeCustomerId,
          mb_hours: usageRecord.quantity.toString(), // Send MB-hours as string
        },
      });

      // Mark as reported
      await db
        .update(usageRecords)
        .set({
          reportedToStripe: true,
          stripeUsageRecordId: meterEvent.identifier,
        })
        .where(eq(usageRecords.id, usageRecord.id));

      console.log(
        `[UsageTracker]   ✓ Reported ${usageRecord.quantity.toFixed(2)} MB-hours to Stripe meter for snapshot ${usageRecord.podId}`,
      );
    } catch (error) {
      console.error(
        `[UsageTracker]   ✗ Failed to report snapshot storage to Stripe:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Report usage to Stripe using Billing Meters (for pod runtime)
   */
  async reportUsageToStripe(
    usageRecord: typeof usageRecords.$inferSelect,
  ): Promise<void> {
    try {
      // Get customer record
      const customer = await db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.userId, usageRecord.userId))
        .limit(1);

      if (customer.length === 0) {
        console.log(
          `[UsageTracker] No Stripe customer for user ${usageRecord.userId}`,
        );
        return;
      }

      const stripeCustomer = customer[0];

      if (!stripeCustomer.stripeSubscriptionId) {
        console.log(
          `[UsageTracker] No subscription for user ${usageRecord.userId}`,
        );
        return;
      }

      // Create meter event name from tier ID
      // e.g., "dev.small" -> "pod_runtime_dev_small"
      const eventName = `pod_runtime_${usageRecord.tierId.replace(".", "_")}`;

      // Report usage to Stripe using Billing Meters
      const meterEvent = await stripe.billing.meterEvents.create({
        event_name: eventName,
        timestamp: Math.floor(usageRecord.periodEnd.getTime() / 1000),
        identifier: usageRecord.id, // For idempotency
        payload: {
          stripe_customer_id: stripeCustomer.stripeCustomerId,
          hours: usageRecord.quantity.toString(), // Send hours as string
        },
      });

      // Mark as reported
      await db
        .update(usageRecords)
        .set({
          reportedToStripe: true,
          stripeUsageRecordId: meterEvent.identifier,
        })
        .where(eq(usageRecords.id, usageRecord.id));

      console.log(
        `[UsageTracker]   ✓ Reported ${usageRecord.quantity} hours to Stripe meter for pod ${usageRecord.podId}`,
      );
    } catch (error) {
      console.error(
        `[UsageTracker]   ✗ Failed to report usage to Stripe for pod ${usageRecord.podId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Track initial 1-hour usage when pod finishes provisioning
   * Called by pod provisioning service to ensure minimum billing
   */
  async trackInitialPodUsage(
    podId: string,
    userId: string,
    tierId: TierId,
  ): Promise<void> {
    console.log(`[UsageTracker] Tracking initial 1-hour usage for pod ${podId}`);

    try {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Create usage record for initial hour
      const usageRecord = await db
        .insert(usageRecords)
        .values({
          id: generateKSUID("usage_record"),
          userId: userId,
          podId: podId,
          tierId: tierId,
          recordType: "runtime",
          quantity: 1.0, // 1 hour
          periodStart: hourAgo,
          periodEnd: now,
          reportedToStripe: false,
          createdAt: new Date(),
        })
        .returning();

      console.log(
        `[UsageTracker]   ✓ Created initial usage record for pod ${podId}`,
      );

      // Report to Stripe immediately
      await this.reportUsageToStripe(usageRecord[0]);
    } catch (error) {
      console.error(
        `[UsageTracker]   ✗ Failed to track initial usage for pod ${podId}:`,
        error,
      );
      // Don't throw - this shouldn't block pod provisioning
    }
  }

  /**
   * Retry unreported usage records
   * Run periodically to catch any failed reports
   */
  async retryUnreportedUsage(): Promise<void> {
    console.log("[UsageTracker] Retrying unreported usage records...");

    // Get unreported records older than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const unreported = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.reportedToStripe, false))
      .limit(100);

    const toRetry = unreported.filter((r) => r.createdAt < tenMinutesAgo);

    console.log(
      `[UsageTracker] Found ${toRetry.length} unreported records to retry`,
    );

    for (const record of toRetry) {
      try {
        await this.reportUsageToStripe(record);
      } catch (error) {
        console.error(
          `[UsageTracker] Failed to retry usage record ${record.id}:`,
          error,
        );
      }
    }

    console.log("[UsageTracker] Completed retry");
  }
}

// Export singleton instance
export const usageTracker = new UsageTracker();
