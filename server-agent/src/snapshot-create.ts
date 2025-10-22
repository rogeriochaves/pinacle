#!/usr/bin/env node
/**
 * Snapshot Create Script
 *
 * Runs on the remote server to create a gVisor container snapshot using runsc tar rootfs-upper.
 * This captures all filesystem changes made to the container.
 *
 * Usage:
 *   snapshot-create --container-id <id> --snapshot-id <id> --storage-type <s3|filesystem> [options]
 */

import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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

/**
 * Get full container ID from Docker (runsc requires the full 64-char ID)
 */
const getFullContainerId = async (
  shortOrFullId: string,
): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const dockerInspect = spawn("docker", [
      "inspect",
      shortOrFullId,
      "--format={{.Id}}",
    ]);

    let stdout = "";
    let stderr = "";

    dockerInspect.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    dockerInspect.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    dockerInspect.on("error", (error) => {
      reject(new Error(`Failed to spawn docker inspect: ${error.message}`));
    });

    dockerInspect.on("exit", (code) => {
      if (code === 0) {
        const fullId = stdout.trim();
        if (fullId && fullId.length === 64) {
          resolve(fullId);
        } else {
          reject(
            new Error(
              `Invalid container ID returned: ${fullId} (length: ${fullId.length})`,
            ),
          );
        }
      } else {
        reject(
          new Error(
            `docker inspect exited with code ${code}: ${stderr}`,
          ),
        );
      }
    });
  });
};

/**
 * Execute runsc tar rootfs-upper to create a snapshot
 */
const createRunscSnapshot = async (
  containerId: string,
  outputPath: string,
): Promise<void> => {
  // Get full container ID (runsc requires the full 64-character ID)
  console.log(
    `[SnapshotCreate] Getting full container ID for: ${containerId}`,
  );
  const fullContainerId = await getFullContainerId(containerId);
  console.log(
    `[SnapshotCreate] Full container ID: ${fullContainerId}`,
  );

  // Check if container is running
  const checkRunning = spawn("docker", ["inspect", fullContainerId, "--format={{.State.Running}}"]);
  let isRunning = "";
  checkRunning.stdout?.on("data", (data) => {
    isRunning += data.toString().trim();
  });
  await new Promise<void>((resolve) => checkRunning.on("exit", () => resolve()));
  console.log(`[SnapshotCreate] Container running: ${isRunning}`);

  // List runsc containers
  console.log(`[SnapshotCreate] Checking runsc container list...`);
  const listContainers = spawn("runsc", ["--root=/run/docker/runtime-runc/moby", "list"]);
  let containerList = "";
  listContainers.stdout?.on("data", (data) => {
    containerList += data.toString();
  });
  await new Promise<void>((resolve) => listContainers.on("exit", () => resolve()));
  console.log(`[SnapshotCreate] Runsc containers:\n${containerList}`);

  // Check if our container is in the list
  if (!containerList.includes(fullContainerId.substring(0, 12))) {
    console.error(`[SnapshotCreate] Container ${fullContainerId} NOT found in runsc list!`);
  } else {
    console.log(`[SnapshotCreate] Container ${fullContainerId} found in runsc list`);
  }

  return new Promise<void>((resolve, reject) => {
    console.log(
      `[SnapshotCreate] Running: sudo runsc --root=/run/docker/runtime-runc/moby tar rootfs-upper --file ${outputPath} ${fullContainerId}`,
    );

    const runsc = spawn("sudo", [
      "/usr/local/bin/runsc",
      "--root=/run/docker/runtime-runc/moby",
      "tar",
      "rootfs-upper",
      "--file",
      outputPath,
      fullContainerId,
    ]);

    let stderr = "";

    runsc.stderr?.on("data", (data) => {
      stderr += data.toString();
      console.log(`[SnapshotCreate] ${data.toString().trim()}`);
    });

    runsc.stdout?.on("data", (data) => {
      console.log(`[SnapshotCreate] ${data.toString().trim()}`);
    });

    runsc.on("error", (error) => {
      reject(new Error(`Failed to spawn runsc: ${error.message}`));
    });

    runsc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `runsc tar rootfs-upper exited with code ${code}: ${stderr}`,
          ),
        );
      }
    });
  });
};

const createSnapshotS3 = async (config: Config): Promise<void> => {
  console.log(
    `[SnapshotCreate] Creating S3 snapshot for container ${config.containerId}`,
  );

  // Create temporary file for uncompressed tar
  const tempTarPath = `/tmp/snapshot-${config.snapshotId}.tar`;
  const tempGzPath = `/tmp/snapshot-${config.snapshotId}.tar.gz`;

  try {
    // Step 1: Create snapshot using runsc
    await createRunscSnapshot(config.containerId, tempTarPath);

    // Step 2: Compress the tar file
    console.log(`[SnapshotCreate] Compressing snapshot...`);
    await pipeline(
      createReadStream(tempTarPath),
      createGzip({ level: 6 }),
      createWriteStream(tempGzPath),
    );

    // Get file size
    const stats = await stat(tempGzPath);
    const sizeBytes = stats.size;

    console.log(
      `[SnapshotCreate] Compressed snapshot: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`,
    );

    // Step 3: Upload to S3
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
    const key = `${config.snapshotId}.tar.gz`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(tempGzPath),
      ContentType: "application/gzip",
      Metadata: {
        snapshotId: config.snapshotId,
        containerId: config.containerId,
        createdAt: new Date().toISOString(),
      },
    });

    await s3Client.send(command);

    console.log(
      `[SnapshotCreate] Successfully uploaded snapshot to s3://${bucket}/${key}`,
    );

    // Output JSON result
    console.log(
      JSON.stringify({
        success: true,
        storagePath: key,
        sizeBytes,
      }),
    );
  } finally {
    // Clean up temp files
    try {
      await unlink(tempTarPath);
    } catch {}
    try {
      await unlink(tempGzPath);
    } catch {}
  }
};

const createSnapshotFilesystem = async (config: Config): Promise<void> => {
  console.log(
    `[SnapshotCreate] Creating filesystem snapshot for container ${config.containerId}`,
  );

  const storagePath = config.storagePath || "/var/lib/pinacle/snapshots";
  const snapshotFileName = `${config.snapshotId}.tar`;
  const finalPath = join(storagePath, snapshotFileName);

  // Ensure storage directory exists
  await mkdir(storagePath, { recursive: true });

  // Create snapshot directly to final location
  await createRunscSnapshot(config.containerId, finalPath);

  // Get file size
  const stats = await stat(finalPath);
  const sizeBytes = stats.size;

  console.log(
    `[SnapshotCreate] Snapshot saved: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB at ${finalPath}`,
  );

  // Output JSON result
  console.log(
    JSON.stringify({
      success: true,
      storagePath: finalPath,
      sizeBytes,
    }),
  );
};

const main = async () => {
  const config = parseArgs();

  try {
    if (config.storageType === "s3") {
      await createSnapshotS3(config);
    } else {
      await createSnapshotFilesystem(config);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[SnapshotCreate] Error: ${message}`);
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
