/**
 * Snapshot Storage Interface
 *
 * Abstraction for storing and retrieving pod snapshots.
 * Implementations: FilesystemStorage (dev) and S3Storage (production with MinIO/S3).
 */

import type { Readable } from "node:stream";

export type SnapshotStorageMetadata = {
  snapshotId: string;
  podId: string;
  sizeBytes: number;
  createdAt: Date;
  contentType: string;
};

export type SnapshotStorage = {
  /**
   * Upload a snapshot to storage
   * @param snapshotId - Unique snapshot ID
   * @param stream - Readable stream of compressed snapshot data
   * @param metadata - Snapshot metadata
   * @returns Storage path/key where snapshot was saved
   */
  upload: (
    snapshotId: string,
    stream: Readable,
    metadata: SnapshotStorageMetadata,
  ) => Promise<string>;

  /**
   * Download a snapshot from storage
   * @param storagePath - Path/key returned from upload
   * @returns Readable stream of snapshot data
   */
  download: (storagePath: string) => Promise<Readable>;

  /**
   * Delete a snapshot from storage
   * @param storagePath - Path/key returned from upload
   */
  delete: (storagePath: string) => Promise<void>;

  /**
   * Check if a snapshot exists in storage
   * @param storagePath - Path/key to check
   */
  exists: (storagePath: string) => Promise<boolean>;

  /**
   * Get metadata about a stored snapshot
   * @param storagePath - Path/key to check
   */
  getMetadata: (storagePath: string) => Promise<{
    sizeBytes: number;
    lastModified: Date;
  } | null>;
};

