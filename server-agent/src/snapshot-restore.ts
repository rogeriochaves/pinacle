#!/usr/bin/env node
/**
 * Snapshot Restore Script - Volume-Based Approach
 *
 * Restores a snapshot by importing all Docker volumes for a pod.
 * This replaces the old image-loading approach.
 *
 * Process:
 * 1. Download snapshot archive from storage
 * 2. Extract metadata and volume tars
 * 3. For each volume, create/clear it and restore data
 * 4. Return success
 *
 * Usage:
 *   snapshot-restore --snapshot-id <id> --pod-id <id> --storage-type <s3|filesystem> [options]
 *
 * Returns: JSON with success status
 */

import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

type Config = {
  snapshotId: string;
  podId: string;
  storageType: "s3" | "filesystem";

  // S3 config
  s3Endpoint?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  s3Bucket?: string;
  s3Region?: string;

  // Filesystem config
  storagePath?: string;
};

type SnapshotMetadata = {
  snapshotId: string;
  podId: string;
  volumes: string[];
  timestamp: string;
  version: string;
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
        case "pod-id":
          config.podId = value;
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

  if (!config.snapshotId || !config.podId || !config.storageType) {
    console.error("Missing required arguments");
    process.exit(1);
  }

  return config as Config;
};

/**
 * Run a command and return stdout
 */
const runCommand = (
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> => {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });

    proc.on("error", reject);
  });
};

/**
 * Get list of volume names for a pod
 */
const getVolumeNames = (podId: string): string[] => {
  const volumeTypes = [
    "workspace",
    "home",
    "root",
    "etc",
    "usr-local",
    "opt",
    "var",
    "srv",
  ];

  return volumeTypes.map((type) => `pinacle-vol-${podId}-${type}`);
};

/**
 * Restore snapshot by importing all volumes
 */
const restoreSnapshot = async (config: Config): Promise<string> => {
  console.log(
    `[SnapshotRestore] Restoring snapshot ${config.snapshotId} for pod ${config.podId}`,
  );

  // Create temp directory
  const tempDir = join(tmpdir(), `pinacle-restore-${config.snapshotId}`);
  await mkdir(tempDir, { recursive: true });

  try {
    // Step 1: Download/decompress snapshot archive
    const snapshotTarPath = join(tempDir, "snapshot.tar");

    if (config.storageType === "s3") {
      await downloadFromS3(config, snapshotTarPath);
    } else {
      await loadFromFilesystem(config, snapshotTarPath);
    }

    console.log(`[SnapshotRestore] Snapshot downloaded to ${snapshotTarPath}`);

    // Step 2: Extract snapshot archive
    console.log(`[SnapshotRestore] Extracting snapshot archive...`);
    const { code: extractCode, stderr: extractStderr } = await runCommand(
      "tar",
      ["-xf", snapshotTarPath, "-C", tempDir],
    );

    if (extractCode !== 0) {
      throw new Error(`Failed to extract snapshot: ${extractStderr}`);
    }

    // Step 3: Read metadata
    const metadataPath = join(tempDir, "snapshot-metadata.json");
    const metadataContent = await readFile(metadataPath, "utf-8");
    const metadata: SnapshotMetadata = JSON.parse(metadataContent);

    console.log(
      `[SnapshotRestore] Snapshot metadata: version ${metadata.version}, ${metadata.volumes.length} volumes`,
    );

    // Step 4: Restore each volume
    const volumesDir = join(tempDir, "volumes");
    const volumeNames = getVolumeNames(config.podId);

    for (const volumeName of volumeNames) {
      const volumeType = volumeName.split("-").pop(); // Extract "workspace", "home", etc
      const volumeTarPath = join(volumesDir, `${volumeType}.tar`);

      console.log(`[SnapshotRestore] Restoring volume ${volumeName}...`);

      // Check if this volume exists in the snapshot
      const { code: statCode } = await runCommand("stat", [volumeTarPath]);
      if (statCode !== 0) {
        console.log(
          `[SnapshotRestore] Volume tar ${volumeType}.tar not found in snapshot, skipping`,
        );
        continue;
      }

      // Ensure volume exists (create if needed)
      const { code: inspectCode } = await runCommand("docker", [
        "volume",
        "inspect",
        volumeName,
      ]);

      if (inspectCode !== 0) {
        console.log(`[SnapshotRestore] Creating volume ${volumeName}...`);
        const { code: createCode, stderr: createStderr } = await runCommand(
          "docker",
          ["volume", "create", volumeName],
        );

        if (createCode !== 0) {
          throw new Error(
            `Failed to create volume ${volumeName}: ${createStderr}`,
          );
        }
      } else {
        // Volume exists - we need to clear it first by removing and recreating
        console.log(
          `[SnapshotRestore] Clearing existing volume ${volumeName}...`,
        );

        const { code: rmCode, stderr: rmStderr } = await runCommand("docker", [
          "volume",
          "rm",
          volumeName,
        ]);

        if (rmCode !== 0) {
          // Volume might be in use, try to continue anyway
          console.warn(
            `[SnapshotRestore] Failed to remove volume ${volumeName} (might be in use): ${rmStderr}`,
          );
          console.warn(
            `[SnapshotRestore] Will attempt to restore anyway by overwriting`,
          );
        } else {
          // Recreate the volume
          const { code: createCode, stderr: createStderr } = await runCommand(
            "docker",
            ["volume", "create", volumeName],
          );

          if (createCode !== 0) {
            throw new Error(
              `Failed to recreate volume ${volumeName}: ${createStderr}`,
            );
          }
        }
      }

      // Restore volume data using a temporary container
      // Mount the volume and extract the tar into it
      console.log(`[SnapshotRestore] Extracting data to ${volumeName}...`);

      const { code: restoreCode, stderr: restoreStderr } = await runCommand(
        "docker",
        [
          "run",
          "--rm",
          "-v",
          `${volumeName}:/data`,
          "-v",
          `${volumesDir}:/input:ro`,
          "alpine:3.22.1",
          "sh",
          "-c",
          `rm -rf /data/* /data/.[!.]* /data/..?* 2>/dev/null || true && tar -xf /input/${volumeType}.tar -C /data`,
        ],
      );

      if (restoreCode !== 0) {
        throw new Error(
          `Failed to restore volume ${volumeName}: ${restoreStderr}`,
        );
      }

      console.log(`[SnapshotRestore] Successfully restored ${volumeName}`);
    }

    console.log(`[SnapshotRestore] All volumes restored successfully`);

    // Return success
    return JSON.stringify({ success: true });
  } catch (error) {
    console.error(`[SnapshotRestore] Error:`, error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // Clean up temp directory
    console.log(`[SnapshotRestore] Cleaning up temp directory...`);
    await rm(tempDir, { recursive: true, force: true });
  }
};

/**
 * Download snapshot from S3
 */
const downloadFromS3 = async (
  config: Config,
  destPath: string,
): Promise<void> => {
  console.log(`[SnapshotRestore] Downloading from S3...`);

  const s3Client = new S3Client({
    endpoint: config.s3Endpoint,
    region: config.s3Region || "auto",
    credentials: {
      accessKeyId: config.s3AccessKey!,
      secretAccessKey: config.s3SecretKey!,
    },
  });

  const key = `${config.snapshotId}.tar.gz`;
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: config.s3Bucket!,
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error("S3 response body is empty");
  }

  // Decompress and save
  await pipeline(
    response.Body as Readable,
    createGunzip(),
    createWriteStream(destPath),
  );

  console.log(
    `[SnapshotRestore] Downloaded from s3://${config.s3Bucket}/${key}`,
  );
};

/**
 * Load snapshot from filesystem
 */
const loadFromFilesystem = async (
  config: Config,
  destPath: string,
): Promise<void> => {
  console.log(`[SnapshotRestore] Loading from filesystem...`);

  const sourcePath = join(config.storagePath!, `${config.snapshotId}.tar.gz`);

  // Decompress
  await pipeline(
    createReadStream(sourcePath),
    createGunzip(),
    createWriteStream(destPath),
  );

  console.log(`[SnapshotRestore] Loaded from ${sourcePath}`);
};

// Main
const main = async () => {
  try {
    const config = parseArgs();
    const result = await restoreSnapshot(config);
    console.log(result); // Output JSON result for parent process
    process.exit(0);
  } catch (error) {
    console.error("[SnapshotRestore] Error:", error);
    console.log(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  }
};

main();
