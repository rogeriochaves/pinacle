/**
 * Snapshot Service
 *
 * Orchestrates snapshot creation and restoration by calling remote scripts on servers.
 * The actual snapshot work (docker export, compression, S3 upload) happens on the remote server.
 */

import { and, desc, eq } from "drizzle-orm";
import { env } from "../../env";
import { db } from "../db";
import { podSnapshots } from "../db/schema";
import type { ServerConnection } from "../pod-orchestration/types";
import { generateKSUID } from "../utils";

export type CreateSnapshotParams = {
  podId: string;
  serverConnection: ServerConnection;
  containerId: string;
  name?: string;
  description?: string;
  isAuto?: boolean;
};

export type RestoreSnapshotParams = {
  snapshotId: string;
  podId: string;
  serverConnection: ServerConnection;
};

export class SnapshotService {
  /**
   * Create a snapshot of a container's filesystem
   * Calls the snapshot-create script on the remote server
   */
  async createSnapshot(params: CreateSnapshotParams): Promise<string> {
    const {
      podId,
      serverConnection,
      containerId,
      name,
      description,
      isAuto = false,
    } = params;

    const snapshotId = generateKSUID("snapshot");
    const snapshotName =
      name || `auto-${new Date().toISOString().split("T")[0]}`;

    console.log(
      `[SnapshotService] Creating snapshot ${snapshotId} for pod ${podId} (container: ${containerId})`,
    );

    // Create initial DB record
    await db.insert(podSnapshots).values({
      id: snapshotId,
      podId,
      name: snapshotName,
      description,
      storagePath: "", // Will update after creation
      sizeBytes: 0, // Will update after creation
      status: "creating",
      isAuto,
    });

    try {
      const storageType = env.SNAPSHOT_STORAGE_TYPE;

      // Build command to run on remote server
      const command = this.buildSnapshotCreateCommand(
        snapshotId,
        containerId,
        storageType,
      );

      console.log(`[SnapshotService] Executing on remote server: ${command}`);

      // Execute on remote server
      const result = await serverConnection.exec(command);

      // Parse JSON output from script
      const output = this.parseScriptOutput(result.stdout);

      if (
        !output.success ||
        !output.storagePath ||
        output.sizeBytes === undefined
      ) {
        throw new Error(output.error || "Snapshot creation failed");
      }

      // Check size limit
      const maxSizeBytes = env.SNAPSHOT_MAX_SIZE_GB * 1024 * 1024 * 1024;
      if (output.sizeBytes > maxSizeBytes) {
        // Clean up - delete from storage
        await this.deleteSnapshotStorage(snapshotId, output.storagePath);
        throw new Error(
          `Snapshot size (${this.formatBytes(output.sizeBytes)}) exceeds limit (${env.SNAPSHOT_MAX_SIZE_GB}GB)`,
        );
      }

      // Update DB record with success
      await db
        .update(podSnapshots)
        .set({
          storagePath: output.storagePath,
          sizeBytes: output.sizeBytes,
          status: "ready",
          completedAt: new Date(),
        })
        .where(eq(podSnapshots.id, snapshotId));

      console.log(
        `[SnapshotService] Successfully created snapshot ${snapshotId} (${this.formatBytes(output.sizeBytes)})`,
      );

      return snapshotId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[SnapshotService] Failed to create snapshot ${snapshotId}: ${errorMessage}`,
      );

      // Update DB with error
      await db
        .update(podSnapshots)
        .set({
          status: "failed",
          errorMessage,
        })
        .where(eq(podSnapshots.id, snapshotId));

      throw new Error(`Snapshot creation failed: ${errorMessage}`);
    }
  }

  /**
   * Restore a snapshot to create a new Docker image
   * Calls the snapshot-restore script on the remote server
   */
  async restoreSnapshot(params: RestoreSnapshotParams): Promise<string> {
    const { snapshotId, podId, serverConnection } = params;

    console.log(
      `[SnapshotService] Restoring snapshot ${snapshotId} for pod ${podId}`,
    );

    // Get snapshot metadata
    const [snapshot] = await db
      .select()
      .from(podSnapshots)
      .where(
        and(eq(podSnapshots.id, snapshotId), eq(podSnapshots.podId, podId)),
      )
      .limit(1);

    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    if (snapshot.status !== "ready") {
      throw new Error(
        `Snapshot ${snapshotId} is not ready (status: ${snapshot.status})`,
      );
    }

    // Update status to restoring
    await db
      .update(podSnapshots)
      .set({ status: "restoring" })
      .where(eq(podSnapshots.id, snapshotId));

    try {
      const storageType = env.SNAPSHOT_STORAGE_TYPE;
      const imageName = `pinacle-restore-${snapshotId}`;

      // Build command to run on remote server
      const command = this.buildSnapshotRestoreCommand(
        snapshotId,
        imageName,
        snapshot.storagePath,
        storageType,
      );

      console.log(`[SnapshotService] Executing on remote server: ${command}`);

      // Execute on remote server
      const result = await serverConnection.exec(command);

      // Parse JSON output from script
      const output = this.parseScriptOutput(result.stdout);

      if (!output.success || !output.imageName) {
        throw new Error(output.error || "Snapshot restoration failed");
      }

      // Use the actual image name returned by the script (which is lowercase)
      const actualImageName = output.imageName;

      console.log(
        `[SnapshotService] Successfully restored snapshot ${snapshotId} to image ${actualImageName}`,
      );

      // Update status back to ready
      await db
        .update(podSnapshots)
        .set({ status: "ready" })
        .where(eq(podSnapshots.id, snapshotId));

      return actualImageName;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[SnapshotService] Failed to restore snapshot ${snapshotId}: ${errorMessage}`,
      );

      // Update status back to ready (snapshot is still valid)
      await db
        .update(podSnapshots)
        .set({ status: "ready" })
        .where(eq(podSnapshots.id, snapshotId));

      throw new Error(`Snapshot restoration failed: ${errorMessage}`);
    }
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(
    snapshotId: string,
    serverConnection: ServerConnection,
  ): Promise<void> {
    console.log(`[SnapshotService] Deleting snapshot ${snapshotId}`);

    // Get snapshot metadata
    const [snapshot] = await db
      .select()
      .from(podSnapshots)
      .where(eq(podSnapshots.id, snapshotId))
      .limit(1);

    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    try {
      // Delete from storage
      if (snapshot.storagePath) {
        await this.deleteSnapshotStorage(
          snapshotId,
          snapshot.storagePath,
          serverConnection,
        );
      }

      // Delete from database
      await db.delete(podSnapshots).where(eq(podSnapshots.id, snapshotId));

      console.log(
        `[SnapshotService] Successfully deleted snapshot ${snapshotId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[SnapshotService] Failed to delete snapshot ${snapshotId}: ${errorMessage}`,
      );
      throw new Error(`Snapshot deletion failed: ${errorMessage}`);
    }
  }

  /**
   * Get the latest snapshot for a pod
   */
  async getLatestSnapshot(podId: string): Promise<string | null> {
    const [snapshot] = await db
      .select({ id: podSnapshots.id })
      .from(podSnapshots)
      .where(
        and(eq(podSnapshots.podId, podId), eq(podSnapshots.status, "ready")),
      )
      .orderBy(desc(podSnapshots.createdAt))
      .limit(1);

    return snapshot?.id || null;
  }

  /**
   * List all snapshots for a pod
   */
  async listSnapshots(
    podId: string,
  ): Promise<Array<typeof podSnapshots.$inferSelect>> {
    return await db
      .select()
      .from(podSnapshots)
      .where(eq(podSnapshots.podId, podId))
      .orderBy(desc(podSnapshots.createdAt));
  }

  /**
   * Build command to create snapshot on remote server
   */
  private buildSnapshotCreateCommand(
    snapshotId: string,
    containerId: string,
    storageType: "s3" | "filesystem",
  ): string {
    const scriptPath =
      "/usr/local/pinacle/server-agent/dist/snapshot-create.js";
    const parts = [
      `node ${scriptPath}`,
      `--container-id ${containerId}`,
      `--snapshot-id ${snapshotId}`,
      `--storage-type ${storageType}`,
    ];

    if (storageType === "s3") {
      // Add S3 configuration
      if (env.SNAPSHOT_S3_ENDPOINT) {
        parts.push(`--s3-endpoint "${env.SNAPSHOT_S3_ENDPOINT}"`);
      }
      parts.push(`--s3-access-key "${env.SNAPSHOT_S3_ACCESS_KEY ?? ""}"`);
      parts.push(`--s3-secret-key "${env.SNAPSHOT_S3_SECRET_KEY ?? ""}"`);
      parts.push(`--s3-bucket "${env.SNAPSHOT_S3_BUCKET}"`);
      parts.push(`--s3-region "${env.SNAPSHOT_S3_REGION}"`);
    } else {
      // Filesystem storage
      parts.push(`--storage-path "${env.SNAPSHOT_STORAGE_PATH}"`);
    }

    return parts.join(" ");
  }

  /**
   * Build command to restore snapshot on remote server
   */
  private buildSnapshotRestoreCommand(
    snapshotId: string,
    imageName: string,
    storagePath: string,
    storageType: "s3" | "filesystem",
  ): string {
    const scriptPath =
      "/usr/local/pinacle/server-agent/dist/snapshot-restore.js";
    const parts = [
      `node ${scriptPath}`,
      `--snapshot-id ${snapshotId}`,
      `--image-name ${imageName}`,
      `--storage-type ${storageType}`,
      `--storage-path "${storagePath}"`,
    ];

    if (storageType === "s3") {
      // Add S3 configuration
      if (env.SNAPSHOT_S3_ENDPOINT) {
        parts.push(`--s3-endpoint "${env.SNAPSHOT_S3_ENDPOINT}"`);
      }
      parts.push(`--s3-access-key "${env.SNAPSHOT_S3_ACCESS_KEY ?? ""}"`);
      parts.push(`--s3-secret-key "${env.SNAPSHOT_S3_SECRET_KEY ?? ""}"`);
      parts.push(`--s3-bucket "${env.SNAPSHOT_S3_BUCKET}"`);
      parts.push(`--s3-region "${env.SNAPSHOT_S3_REGION}"`);
    }

    return parts.join(" ");
  }

  /**
   * Delete snapshot from storage (S3 or filesystem)
   */
  private async deleteSnapshotStorage(
    _snapshotId: string,
    storagePath: string,
    serverConnection?: ServerConnection,
  ): Promise<void> {
    const storageType = env.SNAPSHOT_STORAGE_TYPE;

    if (storageType === "s3") {
      // For S3, we can delete from the main server
      const { S3Client, DeleteObjectCommand } = await import(
        "@aws-sdk/client-s3"
      );
      const s3Client = new S3Client({
        endpoint: env.SNAPSHOT_S3_ENDPOINT,
        region: env.SNAPSHOT_S3_REGION,
        credentials: {
          accessKeyId: env.SNAPSHOT_S3_ACCESS_KEY ?? "",
          secretAccessKey: env.SNAPSHOT_S3_SECRET_KEY ?? "",
        },
        forcePathStyle: !!env.SNAPSHOT_S3_ENDPOINT,
      });

      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: env.SNAPSHOT_S3_BUCKET,
          Key: storagePath,
        }),
      );

      console.log(`[SnapshotService] Deleted snapshot from S3: ${storagePath}`);
    } else if (serverConnection) {
      // For filesystem, delete on remote server
      await serverConnection.exec(`rm -f "${storagePath}"`);
      console.log(
        `[SnapshotService] Deleted snapshot from filesystem: ${storagePath}`,
      );
    }
  }

  /**
   * Parse JSON output from snapshot scripts
   */
  private parseScriptOutput(stdout: string): {
    success: boolean;
    storagePath?: string;
    sizeBytes?: number;
    imageName?: string;
    error?: string;
  } {
    // Find the JSON line in stdout (scripts output JSON on last line)
    const lines = stdout.trim().split("\n");
    const jsonLine = lines[lines.length - 1];

    try {
      return JSON.parse(jsonLine || "{}");
    } catch {
      // If we can't parse JSON, treat as error
      return {
        success: false,
        error: "Failed to parse script output",
      };
    }
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
  }
}
