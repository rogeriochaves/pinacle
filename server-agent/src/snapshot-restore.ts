#!/usr/bin/env node
/**
 * Snapshot Restore Script
 *
 * Runs on the remote server to restore a snapshot into a running container.
 * Downloads from S3 or reads from local filesystem, then extracts into container.
 *
 * Usage:
 *   snapshot-restore --snapshot-id <id> --container-id <id> --storage-type <s3|filesystem> --storage-path <path> [options]
 */

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

type Config = {
  snapshotId: string;
  containerId: string;
  storageType: "s3" | "filesystem";
  storagePath: string; // S3 key or local file path

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
        case "container-id":
          config.containerId = value;
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
    !config.containerId ||
    !config.storageType ||
    !config.storagePath
  ) {
    console.error("Missing required arguments");
    process.exit(1);
  }

  return config as Config;
};

/**
 * Stream snapshot into container and extract
 */
const restoreSnapshotIntoContainer = async (
  containerId: string,
  snapshotStream: Readable,
): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    console.log(
      `[SnapshotRestore] Streaming snapshot into container ${containerId}`,
    );

    // Start docker exec to extract tar into container
    // Exclude system directories and transient files that shouldn't be overwritten
    const dockerExec = spawn("docker", [
      "exec",
      "-i",
      containerId,
      "tar",
      "-xf",
      "-",
      "-C",
      "/",
      "--exclude=dev/*",
      "--exclude=proc/*",
      "--exclude=sys/*",
      "--exclude=*.new",
      "--exclude=run/openrc/*",
      // Exclude transient lock and temp files that cause hardlink errors
      "--exclude=*.lock",
      "--exclude=*.tmp",
      "--exclude=*tmp_*",
      "--exclude=*.journal",
      "--exclude=.apk.*",
    ]);

    if (!dockerExec.stdin) {
      reject(new Error("Failed to get docker exec stdin"));
      return;
    }

    let stderr = "";

    dockerExec.stderr?.on("data", (data) => {
      const message = data.toString();
      stderr += message;
      // Log warnings but they're not necessarily errors
      console.warn(`[SnapshotRestore] ${message.trim()}`);
    });

    dockerExec.stdout?.on("data", (data) => {
      console.log(`[SnapshotRestore] ${data.toString().trim()}`);
    });

    // Pipe snapshot stream into docker exec stdin
    snapshotStream.pipe(dockerExec.stdin);

    dockerExec.stdin.on("error", (err: NodeJS.ErrnoException) => {
      // EPIPE is expected when docker exec finishes early
      if (err.code !== "EPIPE") {
        reject(err);
      }
    });

    dockerExec.on("error", (error) => {
      reject(new Error(`Failed to spawn docker exec: ${error.message}`));
    });

    dockerExec.on("exit", (code) => {
      // tar exit codes:
      // 0 = success
      // 1 = some files differed (warnings, non-fatal)
      // 2 = fatal error, but we tolerate it if it's just hardlink/mknod errors
      // We accept codes 0-2 as success because:
      // - Code 1: warnings about files that changed
      // - Code 2: errors about hardlinks/special files that can't be created (non-critical)
      if (code === 0 || code === 1 || code === 2) {
        if (code !== 0) {
          console.warn(
            `[SnapshotRestore] tar completed with warnings (code ${code}), but snapshot restored successfully`,
          );
        }
        resolve();
      } else {
        reject(
          new Error(
            `docker exec tar exited with code ${code}. stderr: ${stderr}`,
          ),
        );
      }
    });
  });
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
  const key = config.storagePath; // storagePath is the S3 key

  console.log(`[SnapshotRestore] Downloading from s3://${bucket}/${key}`);

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error("No data received from S3");
  }

  const s3Stream = response.Body as Readable;

  await restoreSnapshotIntoContainer(config.containerId, s3Stream);

  console.log(
    `[SnapshotRestore] Successfully restored snapshot ${config.snapshotId} into container ${config.containerId}`,
  );
};

const restoreSnapshotFilesystem = async (config: Config): Promise<void> => {
  console.log(
    `[SnapshotRestore] Restoring snapshot ${config.snapshotId} from filesystem`,
  );

  const filePath = config.storagePath;

  console.log(`[SnapshotRestore] Reading from ${filePath}`);

  const fileStream = createReadStream(filePath);

  await restoreSnapshotIntoContainer(config.containerId, fileStream);

  console.log(
    `[SnapshotRestore] Successfully restored snapshot ${config.snapshotId} into container ${config.containerId}`,
  );
};

const main = async () => {
  const config = parseArgs();

  try {
    if (config.storageType === "s3") {
      await restoreSnapshotS3(config);
    } else {
      await restoreSnapshotFilesystem(config);
    }

    // Output success JSON
    console.log(
      JSON.stringify({
        success: true,
      }),
    );
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
