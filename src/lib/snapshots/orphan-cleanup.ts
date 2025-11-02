/**
 * Orphan Snapshot Cleanup
 *
 * Cleans up snapshot files from S3 that no longer have corresponding database records.
 * This handles cases where:
 * - Snapshot deletion failed but DB record was removed
 * - Manual S3 operations left orphaned files
 * - Snapshots older than 1 hour with no DB record (to avoid race conditions)
 */

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { env } from "../../env";
import { db } from "../db";
import { podSnapshots } from "../db/schema";
import { normalizeStoragePath } from "./snapshot-service";

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Clean up orphan snapshots from S3
 * Returns the number of snapshots deleted
 */
export const cleanupOrphanS3Snapshots = async (): Promise<{
  deletedCount: number;
  errors: string[];
}> => {
  const storageType = env.SNAPSHOT_STORAGE_TYPE;

  if (storageType !== "s3") {
    console.log("[OrphanCleanup] Skipping - not using S3 storage");
    return { deletedCount: 0, errors: [] };
  }

  console.log("[OrphanCleanup] Listing all snapshots from S3...");

  // Initialize S3 client
  const s3Client = new S3Client({
    endpoint: env.SNAPSHOT_S3_ENDPOINT,
    region: env.SNAPSHOT_S3_REGION,
    credentials: {
      accessKeyId: env.SNAPSHOT_S3_ACCESS_KEY ?? "",
      secretAccessKey: env.SNAPSHOT_S3_SECRET_KEY ?? "",
    },
    forcePathStyle: !!env.SNAPSHOT_S3_ENDPOINT,
  });

  try {
    // List all snapshot files in S3
    const listCommand = new ListObjectsV2Command({
      Bucket: env.SNAPSHOT_S3_BUCKET,
      Prefix: "snapshots/",
    });

    const response = await s3Client.send(listCommand);
    const s3Objects = response.Contents || [];

    if (s3Objects.length === 0) {
      console.log("[OrphanCleanup] No snapshots found in S3");
      return { deletedCount: 0, errors: [] };
    }

    console.log(`[OrphanCleanup] Found ${s3Objects.length} snapshots in S3`);

    // Get all snapshot storage paths from database
    const dbSnapshots = await db.select({
      storagePath: podSnapshots.storagePath,
    }).from(podSnapshots);

    // Normalize all DB storage paths to S3 keys
    const dbS3Keys = new Set(
      dbSnapshots
        .map((s) => normalizeStoragePath(s.storagePath))
        .filter(Boolean),
    );

    console.log(`[OrphanCleanup] Found ${dbS3Keys.size} snapshots in database`);

    // Find orphans (in S3 but not in DB, and older than 1 hour)
    const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS);
    const orphans = s3Objects.filter((obj) => {
      if (!obj.Key || !obj.LastModified) return false;

      // Check if older than 1 hour (to avoid race conditions)
      if (obj.LastModified > oneHourAgo) {
        return false;
      }

      // Check if exists in database
      return !dbS3Keys.has(obj.Key);
    });

    if (orphans.length === 0) {
      console.log("[OrphanCleanup] No orphan snapshots found");
      return { deletedCount: 0, errors: [] };
    }

    console.log(
      `[OrphanCleanup] Found ${orphans.length} orphan snapshots (>1h old, not in DB)`,
    );

    // Delete orphans
    const errors: string[] = [];
    let deletedCount = 0;

    for (const orphan of orphans) {
      if (!orphan.Key) continue;

      try {
        const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: env.SNAPSHOT_S3_BUCKET,
            Key: orphan.Key,
          }),
        );

        console.log(`[OrphanCleanup] Deleted orphan: ${orphan.Key}`);
        deletedCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorMsg = `Failed to delete ${orphan.Key}: ${message}`;
        console.error(`[OrphanCleanup] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log(
      `[OrphanCleanup] Completed - deleted ${deletedCount}/${orphans.length} orphans`,
    );

    return { deletedCount, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[OrphanCleanup] Failed to list S3 objects: ${message}`);
    throw error;
  }
};

