/**
 * Storage Factory
 *
 * Creates the appropriate storage provider based on environment configuration.
 */

import { env } from "../../env";
import { FilesystemStorage } from "./filesystem-storage";
import { S3Storage } from "./s3-storage";
import type { SnapshotStorage } from "./storage";

let storageInstance: SnapshotStorage | null = null;

export const getSnapshotStorage = (): SnapshotStorage => {
  if (storageInstance) {
    return storageInstance;
  }

  const storageType = env.SNAPSHOT_STORAGE_TYPE || "filesystem";

  console.log(`[StorageFactory] Initializing ${storageType} storage provider`);

  if (storageType === "s3") {
    storageInstance = new S3Storage();
  } else {
    storageInstance = new FilesystemStorage();
  }

  return storageInstance;
};

// For testing: allow resetting the singleton
export const resetSnapshotStorage = (): void => {
  storageInstance = null;
};

