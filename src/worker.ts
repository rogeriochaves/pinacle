#!/usr/bin/env tsx
/**
 * Background Worker Process
 *
 * Handles periodic tasks like metrics cleanup.
 * Later can be extended for pgboss queues.
 *
 * Run with: tsx src/worker.ts
 * Or build and run: node dist/worker.js
 */

import { lt } from "drizzle-orm";
import { db } from "./lib/db";
import { podMetrics, serverMetrics } from "./lib/db/schema";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 1 * 60 * 60 * 1000;

// Cleanup old metrics (older than 5 days)
const cleanupOldMetrics = async () => {
  try {
    const fiveDaysAgo = new Date(Date.now() - FIVE_DAYS_MS);

    console.log(
      `[Metrics Cleanup] Starting cleanup for metrics older than ${fiveDaysAgo.toISOString()}`,
    );

    // Delete old server metrics
    await db
      .delete(serverMetrics)
      .where(lt(serverMetrics.createdAt, fiveDaysAgo))
      .execute();

    // Delete old pod metrics
    await db
      .delete(podMetrics)
      .where(lt(podMetrics.createdAt, fiveDaysAgo))
      .execute();

    console.log("[Metrics Cleanup] ✅ Cleanup completed successfully");
  } catch (error) {
    console.error("[Metrics Cleanup] ❌ Error:", error);
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

  // Schedule cleanup every 6 hours
  setInterval(() => {
    cleanupOldMetrics();
  }, ONE_HOUR_MS);

  console.log(`📋 Scheduled tasks:`);
  console.log(`   - Metrics cleanup: every hour`);
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

