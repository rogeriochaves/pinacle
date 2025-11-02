#!/usr/bin/env node
/**
 * Snapshot Create Script - Volume-Based Approach
 *
 * Creates a snapshot by exporting all Docker volumes for a pod.
 * This replaces the old rootfs-upper approach which didn't capture volume data.
 *
 * Process:
 * 1. Identify all volumes for the pod (8 volumes: workspace, home, root, etc, usr-local, opt, var, srv)
 * 2. Create a temporary container to export volume data
 * 3. Tar all volumes into a single archive
 * 4. Compress and upload to storage (S3 or filesystem)
 *
 * Usage:
 *   snapshot-create --container-id <id> --snapshot-id <id> --storage-type <s3|filesystem> [options]
 */

import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
 * Get pod ID from container name
 * Container names follow pattern: pinacle-pod-<podId>
 */
const getPodIdFromContainer = async (containerId: string): Promise<string> => {
  const { stdout, code, stderr } = await runCommand("docker", [
    "inspect",
    containerId,
    "--format={{.Name}}",
  ]);

  if (code !== 0) {
    throw new Error(`Failed to get container name: ${stderr}`);
  }

  const containerName = stdout.trim().replace(/^\//, ""); // Remove leading slash
  const match = containerName.match(/^pinacle-pod-(.+)$/);

  if (!match?.[1]) {
    throw new Error(
      `Container name ${containerName} doesn't match expected pattern pinacle-pod-<podId>`,
    );
  }

  return match[1];
};

/**
 * Get list of volumes for a pod
 * Returns volume names in format: pinacle-vol-<podId>-<volumeType>
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
 * Create snapshot by exporting all volumes
 */
const createSnapshot = async (
  config: Config,
): Promise<{ success: boolean; storagePath: string; sizeBytes: number }> => {
  console.log(
    `[SnapshotCreate] Creating volume-based snapshot ${config.snapshotId} for container ${config.containerId}`,
  );

  // Get pod ID from container name
  const podId = await getPodIdFromContainer(config.containerId);
  console.log(`[SnapshotCreate] Pod ID: ${podId}`);

  // Get all volume names
  const volumeNames = getVolumeNames(podId);
  console.log(
    `[SnapshotCreate] Found ${volumeNames.length} volumes to snapshot`,
  );

  // Create temp directory for this snapshot
  const tempDir = join(tmpdir(), `pinacle-snapshot-${config.snapshotId}`);
  await mkdir(tempDir, { recursive: true });
  console.log(`[SnapshotCreate] Using temp directory: ${tempDir}`);

  let volumesTarPath: string;
  let result: { success: boolean; storagePath: string; sizeBytes: number };

  try {
    // Step 1: Verify all volumes exist
    console.log(`[SnapshotCreate] Verifying volumes exist...`);
    for (const volumeName of volumeNames) {
      const { code } = await runCommand("docker", [
        "volume",
        "inspect",
        volumeName,
      ]);
      if (code !== 0) {
        console.warn(`[SnapshotCreate] Volume ${volumeName} doesn't exist, skipping`);
      }
    }

    // Step 2: Create a metadata file with snapshot info
    const metadataPath = join(tempDir, "snapshot-metadata.json");
    const metadata = {
      snapshotId: config.snapshotId,
      podId,
      volumes: volumeNames,
      timestamp: new Date().toISOString(),
      version: "2.0", // New volume-based format
    };
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`[SnapshotCreate] Created metadata file`);

    // Step 3: Export each volume to a tar in temp directory
    const volumeExportsDir = join(tempDir, "volumes");
    await mkdir(volumeExportsDir, { recursive: true });

    for (const volumeName of volumeNames) {
      console.log(`[SnapshotCreate] Exporting volume ${volumeName}...`);

      // Check if volume exists first
      const { code: inspectCode } = await runCommand("docker", [
        "volume",
        "inspect",
        volumeName,
      ]);

      if (inspectCode !== 0) {
        console.log(
          `[SnapshotCreate] Volume ${volumeName} doesn't exist, skipping`,
        );
        continue;
      }

      const volumeType = volumeName.split("-").pop(); // Extract "workspace", "home", etc
      const volumeTarPath = join(volumeExportsDir, `${volumeType}.tar`);

      // Use a temporary Alpine container to tar the volume contents
      // Mount the volume to /data and tar its contents
      const { code, stderr } = await runCommand("docker", [
        "run",
        "--rm",
        "-v",
        `${volumeName}:/data:ro`,
        "-v",
        `${volumeExportsDir}:/output`,
        "alpine:3.22.1",
        "tar",
        "-cf",
        `/output/${volumeType}.tar`,
        "-C",
        "/data",
        ".",
      ]);

      if (code !== 0) {
        throw new Error(
          `Failed to export volume ${volumeName}: ${stderr}`,
        );
      }

      const stats = await stat(volumeTarPath);
      console.log(
        `[SnapshotCreate] Exported ${volumeName}: ${(stats.size / 1024 / 1024).toFixed(2)} MB`,
      );
    }

    // Step 4: Create a single tar containing metadata + all volume tars
    volumesTarPath = join(tempDir, "snapshot.tar");
    console.log(
      `[SnapshotCreate] Creating combined snapshot archive...`,
    );

    const { code: tarCode, stderr: tarStderr } = await runCommand("tar", [
      "-cf",
      volumesTarPath,
      "-C",
      tempDir,
      "snapshot-metadata.json",
      "volumes",
    ]);

    if (tarCode !== 0) {
      throw new Error(`Failed to create snapshot archive: ${tarStderr}`);
    }

    const tarStats = await stat(volumesTarPath);
    console.log(
      `[SnapshotCreate] Created snapshot archive: ${(tarStats.size / 1024 / 1024).toFixed(2)} MB`,
    );

    // Step 5: Compress and store
    if (config.storageType === "s3") {
      await uploadToS3(config, volumesTarPath);
    } else {
      await saveToFilesystem(config, volumesTarPath);
    }

    console.log(`[SnapshotCreate] Snapshot created successfully`);

    // Prepare success result (expected by snapshot-service.ts)
    const finalPath =
      config.storageType === "s3"
        ? `${volumesTarPath}.gz`
        : join(config.storagePath!, `${config.snapshotId}.tar.gz`);

    const finalStats = await stat(finalPath);

    result = {
      success: true,
      storagePath:
        config.storageType === "s3"
          ? `snapshots/${config.snapshotId}.tar.gz`
          : finalPath,
      sizeBytes: finalStats.size,
    };
  } finally {
    // Clean up temp directory
    console.log(`[SnapshotCreate] Cleaning up temp directory...`);
    await rm(tempDir, { recursive: true, force: true });
  }

  return result;
};

/**
 * Upload snapshot to S3
 */
const uploadToS3 = async (
  config: Config,
  volumesTarPath: string,
): Promise<void> => {
  console.log(`[SnapshotCreate] Uploading to S3...`);

  const s3Client = new S3Client({
    endpoint: config.s3Endpoint,
    region: config.s3Region || "auto",
    credentials: {
      accessKeyId: config.s3AccessKey!,
      secretAccessKey: config.s3SecretKey!,
    },
  });

  // Compress and upload
  const compressedPath = `${volumesTarPath}.gz`;
  await pipeline(
    createReadStream(volumesTarPath),
    createGzip(),
    createWriteStream(compressedPath),
  );

  const stats = await stat(compressedPath);
  console.log(
    `[SnapshotCreate] Compressed to ${(stats.size / 1024 / 1024).toFixed(2)} MB`,
  );

  const key = `snapshots/${config.snapshotId}.tar.gz`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket!,
      Key: key,
      Body: createReadStream(compressedPath),
    }),
  );

  console.log(`[SnapshotCreate] Uploaded to s3://${config.s3Bucket}/${key}`);
};

/**
 * Save snapshot to filesystem
 */
const saveToFilesystem = async (
  config: Config,
  volumesTarPath: string,
): Promise<void> => {
  console.log(`[SnapshotCreate] Saving to filesystem...`);

  // Ensure storage directory exists
  await mkdir(config.storagePath!, { recursive: true });

  // Compress and save
  const destPath = join(config.storagePath!, `${config.snapshotId}.tar.gz`);
  await pipeline(
    createReadStream(volumesTarPath),
    createGzip(),
    createWriteStream(destPath),
  );

  const stats = await stat(destPath);
  console.log(
    `[SnapshotCreate] Saved ${(stats.size / 1024 / 1024).toFixed(2)} MB to ${destPath}`,
  );
};

// Main
const main = async () => {
  try {
    const config = parseArgs();
    const result = await createSnapshot(config);
    // Output JSON result for parent process to parse
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    console.error("[SnapshotCreate] Error:", error);
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
