/**
 * Filesystem Storage Provider
 *
 * Stores snapshots on local filesystem for development.
 * Files are stored in SNAPSHOT_STORAGE_PATH directory.
 */

import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env } from "../../env";
import type { SnapshotStorage, SnapshotStorageMetadata } from "./storage";

export class FilesystemStorage implements SnapshotStorage {
  private baseDir: string;

  constructor() {
    this.baseDir = env.SNAPSHOT_STORAGE_PATH || "./data/snapshots";
  }

  private async ensureBaseDir(): Promise<void> {
    try {
      await access(this.baseDir);
    } catch {
      await mkdir(this.baseDir, { recursive: true });
      console.log(`[FilesystemStorage] Created storage directory: ${this.baseDir}`);
    }
  }

  private getFilePath(snapshotId: string): string {
    return join(this.baseDir, `${snapshotId}.tar.gz`);
  }

  async upload(
    snapshotId: string,
    stream: Readable,
    _metadata: SnapshotStorageMetadata,
  ): Promise<string> {
    await this.ensureBaseDir();

    const filePath = this.getFilePath(snapshotId);
    const writeStream = createWriteStream(filePath);

    try {
      await pipeline(stream, writeStream);
      console.log(`[FilesystemStorage] Uploaded snapshot to: ${filePath}`);
      return filePath;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FilesystemStorage] Upload failed: ${message}`);

      // Clean up partial file
      try {
        await rm(filePath, { force: true });
      } catch {
        // Ignore cleanup errors
      }

      throw new Error(`Failed to upload snapshot: ${message}`);
    }
  }

  async download(storagePath: string): Promise<Readable> {
    try {
      await access(storagePath);
      const readStream = createReadStream(storagePath);
      console.log(`[FilesystemStorage] Downloading snapshot from: ${storagePath}`);
      return readStream;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FilesystemStorage] Download failed: ${message}`);
      throw new Error(`Failed to download snapshot: ${message}`);
    }
  }

  async delete(storagePath: string): Promise<void> {
    try {
      await rm(storagePath, { force: true });
      console.log(`[FilesystemStorage] Deleted snapshot: ${storagePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FilesystemStorage] Delete failed: ${message}`);
      throw new Error(`Failed to delete snapshot: ${message}`);
    }
  }

  async exists(storagePath: string): Promise<boolean> {
    try {
      await access(storagePath);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(storagePath: string): Promise<{
    sizeBytes: number;
    lastModified: Date;
  } | null> {
    try {
      const stats = await stat(storagePath);
      return {
        sizeBytes: stats.size,
        lastModified: stats.mtime,
      };
    } catch {
      return null;
    }
  }
}

