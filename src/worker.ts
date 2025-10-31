#!/usr/bin/env tsx
/**
 * Background Worker Process
 *
 * Handles periodic tasks like metrics cleanup and usage tracking.
 * Later can be extended for pgboss queues.
 *
 * Run with: tsx src/worker.ts
 * Or build and run: node dist/worker.js
 */

import { lt } from "drizzle-orm";
import { gracePeriodEnforcer } from "./lib/billing/grace-period-enforcer";
import { usageTracker } from "./lib/billing/usage-tracker";
import { db } from "./lib/db";
import { podLogs, podMetrics, serverMetrics } from "./lib/db/schema";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 1 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// Cleanup old metrics (older than 5 days)
const cleanupOldMetrics = async () => {
  try {
    const fiveDaysAgo = new Date(Date.now() - FIVE_DAYS_MS);

    console.log(
      `[Metrics Cleanup] Starting cleanup for metrics older than ${fiveDaysAgo.toISOString()}`,
    );

    // Delete old server metrics
    const serverMetricsDeleted = await db
      .delete(serverMetrics)
      .where(lt(serverMetrics.createdAt, fiveDaysAgo))
      .returning();

    // Delete old pod metrics
    const podMetricsDeleted = await db
      .delete(podMetrics)
      .where(lt(podMetrics.createdAt, fiveDaysAgo))
      .returning();

    // Delete old pod logs
    const podLogsDeleted = await db
      .delete(podLogs)
      .where(lt(podLogs.createdAt, fiveDaysAgo))
      .returning();

    console.log("[Metrics Cleanup] ✅ Cleanup completed successfully");
    console.log(`  - Server metrics deleted: ${serverMetricsDeleted.length || 0}`);
    console.log(`  - Pod metrics deleted: ${podMetricsDeleted.length || 0}`);
    console.log(`  - Pod logs deleted: ${podLogsDeleted.length || 0}`);
  } catch (error) {
    console.error("[Metrics Cleanup] ❌ Error:", error);
  }
};

// Track pod usage for billing
const trackPodUsage = async () => {
  try {
    console.log("[Pod Usage] Starting hourly usage tracking...");
    await usageTracker.trackPodRuntime();
    console.log("[Pod Usage] ✅ Usage tracking completed");
  } catch (error) {
    console.error("[Pod Usage] ❌ Error:", error);
  }
};

// Retry unreported usage records
const retryUnreportedUsage = async () => {
  try {
    console.log("[Pod Usage] Retrying unreported usage...");
    await usageTracker.retryUnreportedUsage();
    console.log("[Pod Usage] ✅ Retry completed");
  } catch (error) {
    console.error("[Pod Usage] ❌ Error:", error);
  }
};

// Enforce grace period for users with payment failures
const enforceGracePeriod = async () => {
  try {
    console.log("[Grace Period] Starting enforcement...");
    await gracePeriodEnforcer.enforceGracePeriod();
    console.log("[Grace Period] ✅ Enforcement completed");
  } catch (error) {
    console.error("[Grace Period] ❌ Error:", error);
  }
};

// Main worker function
const startWorker = async () => {
  console.log("🚀 Background worker started");

  // Run initial cleanup after 10 seconds
  setTimeout(() => {
    console.log("[Worker] Running initial cleanup...");
    cleanupOldMetrics();
  }, 10_000);

  // Run initial usage tracking after 30 seconds
  setTimeout(() => {
    console.log("[Worker] Running initial usage tracking...");
    trackPodUsage();
  }, 30_000);

  // Schedule cleanup every hour
  setInterval(() => {
    cleanupOldMetrics();
  }, ONE_HOUR_MS);

  // Schedule usage tracking every hour
  setInterval(() => {
    trackPodUsage();
  }, ONE_HOUR_MS);

  // Schedule usage retry every 6 hours
  setInterval(() => {
    retryUnreportedUsage();
  }, SIX_HOURS_MS);

  // Run initial grace period enforcement after 60 seconds
  setTimeout(() => {
    console.log("[Worker] Running initial grace period enforcement...");
    enforceGracePeriod();
  }, 60_000);

  // Schedule grace period enforcement every 6 hours
  setInterval(() => {
    enforceGracePeriod();
  }, SIX_HOURS_MS);

  console.log(`📋 Scheduled tasks:`);
  console.log(`   - Metrics cleanup: every hour`);
  console.log(`   - Pod usage tracking: every hour`);
  console.log(`   - Usage retry: every 6 hours`);
  console.log(`   - Grace period enforcement: every 6 hours`);
  console.log(`   - Retention period: 5 days`);

  // Keep process alive
  process.on("SIGTERM", () => {
    console.log("📛 Received SIGTERM, shutting down gracefully...");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("📛 Received SIGINT, shutting down gracefully...");
    process.exit(0);
  });
};

// Start the worker
startWorker().catch((error) => {
  console.error("❌ Worker failed to start:", error);
  process.exit(1);
});

