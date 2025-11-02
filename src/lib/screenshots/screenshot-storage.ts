/**
 * Screenshot Storage Service
 *
 * Stores pod screenshots in S3-compatible storage using the same credentials
 * as pod snapshots, but in a separate "screenshots/" folder.
 */

import "server-only";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../env";

export class ScreenshotStorage {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const endpoint = env.SNAPSHOT_S3_ENDPOINT;
    const region = env.SNAPSHOT_S3_REGION;
    this.bucket = env.SNAPSHOT_S3_BUCKET;

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
      `[ScreenshotStorage] Initialized screenshot storage (bucket: ${this.bucket}, endpoint: ${endpoint || "AWS S3"})`,
    );
  }

  private getObjectKey(screenshotId: string): string {
    return `screenshots/${screenshotId}.png`;
  }

  async upload(
    screenshotId: string,
    imageBuffer: Buffer,
  ): Promise<{ url: string; sizeBytes: number }> {
    const key = this.getObjectKey(screenshotId);

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: imageBuffer,
          ContentType: "image/png",
          // No ACL - keep private, we'll use signed URLs
          Metadata: {
            screenshotId,
            createdAt: new Date().toISOString(),
          },
        }),
      );

      // Construct public URL (adjust based on your S3 setup)
      const url = env.SNAPSHOT_S3_ENDPOINT
        ? `${env.SNAPSHOT_S3_ENDPOINT}/${this.bucket}/${key}`
        : `https://${this.bucket}.s3.${env.SNAPSHOT_S3_REGION}.amazonaws.com/${key}`;

      console.log(
        `[ScreenshotStorage] Uploaded screenshot to: s3://${this.bucket}/${key}`,
      );

      return {
        url,
        sizeBytes: imageBuffer.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ScreenshotStorage] Upload failed: ${message}`);
      throw new Error(`Failed to upload screenshot to S3: ${message}`);
    }
  }

  /**
   * Get public URL for a screenshot
   */
  getPublicUrl(screenshotId: string): string {
    const key = this.getObjectKey(screenshotId);
    return env.SNAPSHOT_S3_ENDPOINT
      ? `${env.SNAPSHOT_S3_ENDPOINT}/${this.bucket}/${key}`
      : `https://${this.bucket}.s3.${env.SNAPSHOT_S3_REGION}.amazonaws.com/${key}`;
  }

  /**
   * Generate a signed URL for a screenshot (valid for 1 hour)
   */
  async getSignedUrl(screenshotId: string): Promise<string> {
    const key = this.getObjectKey(screenshotId);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      // Generate signed URL that expires in 1 hour
      // biome-ignore lint/suspicious/noExplicitAny: it works *shrug*
      const signedUrl = await getSignedUrl(this.client as any, command as any, {
        expiresIn: 3600, // 1 hour
      });

      console.log(
        `[ScreenshotStorage] Generated signed URL for: ${screenshotId}`,
      );

      return signedUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ScreenshotStorage] Failed to generate signed URL: ${message}`,
      );
      throw new Error(`Failed to generate signed URL: ${message}`);
    }
  }

  /**
   * Delete a screenshot from S3
   */
  async deleteScreenshot(screenshotId: string): Promise<void> {
    const key = this.getObjectKey(screenshotId);

    try {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      console.log(
        `[ScreenshotStorage] Deleted screenshot: s3://${this.bucket}/${key}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ScreenshotStorage] Delete failed: ${message}`);
      throw new Error(`Failed to delete screenshot from S3: ${message}`);
    }
  }
}

// Singleton instance
let screenshotStorage: ScreenshotStorage | null = null;

export const getScreenshotStorage = (): ScreenshotStorage => {
  if (!screenshotStorage) {
    screenshotStorage = new ScreenshotStorage();
  }
  return screenshotStorage;
};
