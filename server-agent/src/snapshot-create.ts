#!/usr/bin/env node
/**
 * Snapshot Create Script
 *
 * Runs on the remote server to create a container snapshot.
 * Exports container, compresses, and uploads to S3 or saves locally.
 *
 * Usage:
 *   snapshot-create --container-id <id> --snapshot-id <id> --storage-type <s3|filesystem> [options]
 */

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createGzip } from "node:zlib";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

type Config = {
  containerId: string;
  snapshotId: string;
  storageType: "s3" | "filesystem";

  // S3 config (when storageType === "s3")
  s3Endpoint?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  s3Bucket?: string;
  s3Region?: string;

  // Filesystem config (when storageType === "filesystem")
  storagePath?: string;
};

const parseArgs = (): Config => {
  const args = process.argv.slice(2);
  const config: Partial<Config> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    const value = args[i + 1];

    if (key && value) {
      switch (key) {
        case "container-id":
          config.containerId = value;
          break;
        case "snapshot-id":
          config.snapshotId = value;
          break;
        case "storage-type":
          config.storageType = value as "s3" | "filesystem";
          break;
        case "s3-endpoint":
          config.s3Endpoint = value;
          break;
        case "s3-access-key":
          config.s3AccessKey = value;
          break;
        case "s3-secret-key":
          config.s3SecretKey = value;
          break;
        case "s3-bucket":
          config.s3Bucket = value;
          break;
        case "s3-region":
          config.s3Region = value;
          break;
        case "storage-path":
          config.storagePath = value;
          break;
      }
    }
  }

  if (!config.containerId || !config.snapshotId || !config.storageType) {
    console.error("Missing required arguments");
    process.exit(1);
  }

  return config as Config;
};

const createSnapshotS3 = async (config: Config): Promise<void> => {
  console.log(`[SnapshotCreate] Creating S3 snapshot for container ${config.containerId}`);

  const s3Client = new S3Client({
    endpoint: config.s3Endpoint,
    region: config.s3Region || "us-east-1",
    credentials: {
      accessKeyId: config.s3AccessKey || "",
      secretAccessKey: config.s3SecretKey || "",
    },
    forcePathStyle: !!config.s3Endpoint,
  });

  const bucket = config.s3Bucket || "pinacle-snapshots";
  const key = `snapshots/${config.snapshotId}.tar.gz`;

  // Spawn docker export
  const dockerExport = spawn("docker", ["export", config.containerId]);

  if (!dockerExport.stdout) {
    throw new Error("Failed to get docker export stdout");
  }

  // Pipe through gzip
  const gzip = createGzip({ level: 6 });
  dockerExport.stdout.pipe(gzip);

  // Upload to S3 using multipart upload
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: gzip,
      ContentType: "application/gzip",
      Metadata: {
        snapshotId: config.snapshotId,
        containerId: config.containerId,
        createdAt: new Date().toISOString(),
      },
    },
  });

  let uploadedBytes = 0;
  upload.on("httpUploadProgress", (progress: { loaded?: number }) => {
    if (progress.loaded) {
      uploadedBytes = progress.loaded;
      console.log(`[SnapshotCreate] Uploaded ${(uploadedBytes / 1024 / 1024).toFixed(2)} MB`);
    }
  });

  await upload.done();

  console.log(`[SnapshotCreate] Successfully uploaded snapshot to s3://${bucket}/${key}`);
  console.log(JSON.stringify({
    success: true,
    storagePath: key,
    sizeBytes: uploadedBytes,
  }));
};

const createSnapshotFilesystem = async (config: Config): Promise<void> => {
  console.log(`[SnapshotCreate] Creating filesystem snapshot for container ${config.containerId}`);

  const storagePath = config.storagePath || "/var/lib/pinacle/snapshots";
  const filePath = `${storagePath}/${config.snapshotId}.tar.gz`;

  // Ensure directory exists
  await mkdir(dirname(filePath), { recursive: true });

  // Spawn docker export
  const dockerExport = spawn("docker", ["export", config.containerId]);

  if (!dockerExport.stdout) {
    throw new Error("Failed to get docker export stdout");
  }

  // Pipe through gzip to file
  const gzip = createGzip({ level: 6 });
  const fileStream = createWriteStream(filePath);

  dockerExport.stdout.pipe(gzip).pipe(fileStream);

  // Track size
  let sizeBytes = 0;
  gzip.on("data", (chunk) => {
    sizeBytes += chunk.length;
  });

  // Wait for completion
  await new Promise<void>((resolve, reject) => {
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
    dockerExport.on("error", reject);
  });

  console.log(`[SnapshotCreate] Successfully saved snapshot to ${filePath}`);
  console.log(JSON.stringify({
    success: true,
    storagePath: filePath,
    sizeBytes,
  }));
};

const main = async () => {
  try {
    const config = parseArgs();

    if (config.storageType === "s3") {
      await createSnapshotS3(config);
    } else {
      await createSnapshotFilesystem(config);
    }

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[SnapshotCreate] Error: ${message}`);
    console.log(JSON.stringify({
      success: false,
      error: message,
    }));
    process.exit(1);
  }
};

main();

