/**
 * S3 Storage Provider
 *
 * Stores snapshots in S3-compatible storage (AWS S3 or MinIO).
 * Compatible with both AWS S3 and self-hosted MinIO.
 */

import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "../../env";
import type { SnapshotStorage, SnapshotStorageMetadata } from "./storage";

export class S3Storage implements SnapshotStorage {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const endpoint = env.SNAPSHOT_S3_ENDPOINT;
    const region = env.SNAPSHOT_S3_REGION || "us-east-1";

    this.bucket = env.SNAPSHOT_S3_BUCKET || "pinacle-snapshots";

    // Configure S3 client for MinIO or AWS S3
    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: env.SNAPSHOT_S3_ACCESS_KEY || "",
        secretAccessKey: env.SNAPSHOT_S3_SECRET_KEY || "",
      },
      // Force path style for MinIO compatibility
      forcePathStyle: !!endpoint,
    });

    console.log(
      `[S3Storage] Initialized S3 storage (bucket: ${this.bucket}, endpoint: ${endpoint || "AWS S3"})`,
    );
  }

  private getObjectKey(snapshotId: string): string {
    return `snapshots/${snapshotId}.tar.gz`;
  }

  async upload(
    snapshotId: string,
    stream: Readable,
    metadata: SnapshotStorageMetadata,
  ): Promise<string> {
    const key = this.getObjectKey(snapshotId);

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: stream,
          ContentType: "application/gzip",
          Metadata: {
            snapshotId,
            podId: metadata.podId,
            createdAt: metadata.createdAt.toISOString(),
          },
        }),
      );

      console.log(
        `[S3Storage] Uploaded snapshot to: s3://${this.bucket}/${key}`,
      );
      return key;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[S3Storage] Upload failed: ${message}`);
      throw new Error(`Failed to upload snapshot to S3: ${message}`);
    }
  }

  async download(storagePath: string): Promise<Readable> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
        }),
      );

      if (!response.Body) {
        throw new Error("No data received from S3");
      }

      console.log(
        `[S3Storage] Downloading snapshot from: s3://${this.bucket}/${storagePath}`,
      );
      return response.Body as Readable;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[S3Storage] Download failed: ${message}`);
      throw new Error(`Failed to download snapshot from S3: ${message}`);
    }
  }

  async delete(storagePath: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
        }),
      );

      console.log(
        `[S3Storage] Deleted snapshot: s3://${this.bucket}/${storagePath}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[S3Storage] Delete failed: ${message}`);
      throw new Error(`Failed to delete snapshot from S3: ${message}`);
    }
  }

  async exists(storagePath: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
        }),
      );
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
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
        }),
      );

      if (!response.ContentLength || !response.LastModified) {
        return null;
      }

      return {
        sizeBytes: response.ContentLength,
        lastModified: response.LastModified,
      };
    } catch {
      return null;
    }
  }
}
