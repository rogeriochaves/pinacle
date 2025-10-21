#!/usr/bin/env node
/**
 * Snapshot Restore Script
 *
 * Runs on the remote server to restore a container snapshot.
 * Downloads from S3 or reads from local filesystem, decompresses, and imports to Docker.
 *
 * Usage:
 *   snapshot-restore --snapshot-id <id> --image-name <name> --storage-type <s3|filesystem> --storage-path <path> [options]
 */

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

type Config = {
  snapshotId: string;
  imageName: string;
  storageType: "s3" | "filesystem";
  storagePath: string;

  // S3 config (when storageType === "s3")
  s3Endpoint?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  s3Bucket?: string;
  s3Region?: string;
};

const parseArgs = (): Config => {
  const args = process.argv.slice(2);
  const config: Partial<Config> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    const value = args[i + 1];

    if (key && value) {
      switch (key) {
        case "snapshot-id":
          config.snapshotId = value;
          break;
        case "image-name":
          config.imageName = value;
          break;
        case "storage-type":
          config.storageType = value as "s3" | "filesystem";
          break;
        case "storage-path":
          config.storagePath = value;
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
      }
    }
  }

  if (
    !config.snapshotId ||
    !config.imageName ||
    !config.storageType ||
    !config.storagePath
  ) {
    console.error("Missing required arguments");
    process.exit(1);
  }

  return config as Config;
};

const restoreSnapshotS3 = async (config: Config): Promise<void> => {
  console.log(
    `[SnapshotRestore] Restoring snapshot ${config.snapshotId} from S3`,
  );

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

  // Download from S3
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: config.storagePath,
    }),
  );

  if (!response.Body) {
    throw new Error("No data received from S3");
  }

  const s3Stream = response.Body as Readable;

  // Decompress
  const gunzip = createGunzip();

  // Import to Docker (image names must be lowercase)
  const dockerImport = spawn("docker", ["import", "-", config.imageName.toLowerCase()]);

  if (!dockerImport.stdin) {
    throw new Error("Failed to get docker import stdin");
  }

  // Capture stderr for debugging
  let stderr = "";
  dockerImport.stderr?.on("data", (data) => {
    stderr += data.toString();
  });

  // Pipe S3 -> gunzip -> docker import
  s3Stream.pipe(gunzip).pipe(dockerImport.stdin);

  // Wait for completion
  await new Promise<void>((resolve, reject) => {
    dockerImport.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const errorMsg = stderr || "Unknown error";
        reject(new Error(`Docker import exited with code ${code}: ${errorMsg}`));
      }
    });
    dockerImport.on("error", reject);

    // Handle EPIPE errors gracefully (docker import closes stdin early)
    dockerImport.stdin?.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EPIPE") {
        reject(err);
      }
      // EPIPE is expected when docker import finishes - ignore it
    });
  });

  const imageName = config.imageName.toLowerCase();
  console.log(
    `[SnapshotRestore] Successfully restored snapshot to image ${imageName}`,
  );
  console.log(
    JSON.stringify({
      success: true,
      imageName,
    }),
  );
};

const restoreSnapshotFilesystem = async (config: Config): Promise<void> => {
  console.log(
    `[SnapshotRestore] Restoring snapshot ${config.snapshotId} from filesystem`,
  );

  // Read from local file
  const fileStream = createReadStream(config.storagePath);

  // Decompress
  const gunzip = createGunzip();

  // Import to Docker (image names must be lowercase)
  const dockerImport = spawn("docker", ["import", "-", config.imageName.toLowerCase()]);

  if (!dockerImport.stdin) {
    throw new Error("Failed to get docker import stdin");
  }

  // Capture stderr for debugging
  let stderr = "";
  dockerImport.stderr?.on("data", (data) => {
    stderr += data.toString();
  });

  // Pipe file -> gunzip -> docker import
  fileStream.pipe(gunzip).pipe(dockerImport.stdin);

  // Wait for completion
  await new Promise<void>((resolve, reject) => {
    dockerImport.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const errorMsg = stderr || "Unknown error";
        reject(new Error(`Docker import exited with code ${code}: ${errorMsg}`));
      }
    });
    dockerImport.on("error", reject);

    // Handle EPIPE errors gracefully (docker import closes stdin early)
    dockerImport.stdin?.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EPIPE") {
        reject(err);
      }
      // EPIPE is expected when docker import finishes - ignore it
    });
  });

  const imageName = config.imageName.toLowerCase();
  console.log(
    `[SnapshotRestore] Successfully restored snapshot to image ${imageName}`,
  );
  console.log(
    JSON.stringify({
      success: true,
      imageName,
    }),
  );
};

const main = async () => {
  try {
    const config = parseArgs();

    if (config.storageType === "s3") {
      await restoreSnapshotS3(config);
    } else {
      await restoreSnapshotFilesystem(config);
    }

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[SnapshotRestore] Error: ${message}`);
    console.log(
      JSON.stringify({
        success: false,
        error: message,
      }),
    );
    process.exit(1);
  }
};

main();
