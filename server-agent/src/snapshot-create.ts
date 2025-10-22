#!/usr/bin/env node
/**
 * Snapshot Create Script
 *
 * Creates a gVisor container snapshot by:
 * 1. Extracting rootfs changes using runsc tar rootfs-upper
 * 2. Building a Docker image with those changes baked in
 * 3. Exporting the image using docker save
 * 4. Storing the image (S3 or filesystem)
 *
 * This approach avoids overlayfs overhead by baking changes into image layers.
 *
 * Usage:
 *   snapshot-create --container-id <id> --snapshot-id <id> --storage-type <s3|filesystem> [options]
 */

import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, unlink, writeFile } from "node:fs/promises";
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

    dockerInspect.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    dockerInspect.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    dockerInspect.on("close", (code) => {
      if (code === 0) {
        const fullId = stdout.trim();
        resolve(fullId);
      } else {
        reject(new Error(`Failed to get container ID: ${stderr}`));
      }
    });

    dockerInspect.on("error", reject);
  });
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
 * Create snapshot using the new image-based approach
 */
const createSnapshot = async (
  config: Config,
): Promise<{ success: boolean; storagePath: string; sizeBytes: number }> => {
  console.log(
    `[SnapshotCreate] Creating snapshot ${config.snapshotId} for container ${config.containerId}`,
  );

  // Get full container ID
  const fullContainerId = await getFullContainerId(config.containerId);
  console.log(`[SnapshotCreate] Full container ID: ${fullContainerId}`);

  // Get the image the container was created from (for cleanup later)
  const inspectResult = await runCommand("docker", [
    "inspect",
    fullContainerId,
    "--format={{.Config.Image}}",
  ]);
  const oldImageName = inspectResult.stdout.trim();
  console.log(`[SnapshotCreate] Container using image: ${oldImageName}`);

  // Create temp directory for this snapshot
  const tempDir = join(tmpdir(), `pinacle-snapshot-${config.snapshotId}`);
  await mkdir(tempDir, { recursive: true });
  console.log(`[SnapshotCreate] Using temp directory: ${tempDir}`);

  let imageTarPath: string;
  let result: { success: boolean; storagePath: string; sizeBytes: number };

  try {
    // Step 1: Extract rootfs using runsc tar rootfs-upper
    const rootfsTarPath = join(tempDir, "rootfs.tar");
    console.log(`[SnapshotCreate] Extracting rootfs to ${rootfsTarPath}...`);

    const { code, stderr } = await runCommand("sudo", [
      "runsc",
      "--root=/run/docker/runtime-runc/moby",
      "tar",
      "rootfs-upper",
      "--file",
      rootfsTarPath,
      fullContainerId,
    ]);

    if (code !== 0) {
      throw new Error(`runsc tar rootfs-upper failed: ${stderr}`);
    }

    const stats = await stat(rootfsTarPath);
    console.log(
      `[SnapshotCreate] Extracted ${(stats.size / 1024 / 1024).toFixed(2)} MB`,
    );

    // Step 2: Extract tar to build directory
    const buildDir = join(tempDir, "build");
    await mkdir(buildDir, { recursive: true });
    console.log(`[SnapshotCreate] Extracting tar to ${buildDir}...`);

    const extractResult = await runCommand("tar", [
      "-xf",
      rootfsTarPath,
      "-C",
      buildDir,
      "--exclude=dev",
      "--exclude=proc",
      "--exclude=sys",
      "--exclude=run",
    ]);

    if (extractResult.code !== 0 && extractResult.code !== 2) {
      // Exit code 2 is acceptable (partial success)
      throw new Error(`tar extract failed: ${extractResult.stderr}`);
    }

    // Step 3: Remove special files (devices, sockets, etc) that can't be copied in Dockerfile
    console.log(`[SnapshotCreate] Removing special files...`);
    await runCommand("find", [
      buildDir,
      "(",
      "-type",
      "p",
      "-o",
      "-type",
      "s",
      "-o",
      "-type",
      "b",
      "-o",
      "-type",
      "c",
      ")",
      "-delete",
    ]);

    // Step 4: Create Dockerfile
    // Use the current image as base (builds on top of previous snapshot)
    const dockerfile = `FROM ${oldImageName}
COPY . /
`;
    await writeFile(join(buildDir, "Dockerfile"), dockerfile);
    console.log(`[SnapshotCreate] Created Dockerfile using base image: ${oldImageName}`);

    // Step 5: Build Docker image
    const imageName = `pinacle-snapshot:${config.snapshotId}`;
    console.log(`[SnapshotCreate] Building image ${imageName}...`);

    const buildResult = await runCommand("docker", [
      "build",
      "-t",
      imageName,
      buildDir,
    ]);

    if (buildResult.code !== 0) {
      console.error(`[SnapshotCreate] Build output: ${buildResult.stdout}`);
      throw new Error(`docker build failed: ${buildResult.stderr}`);
    }

    console.log(`[SnapshotCreate] Image built successfully`);

    // Step 6: Export image using docker save
    imageTarPath = join(tempDir, "snapshot-image.tar");
    console.log(`[SnapshotCreate] Exporting image to ${imageTarPath}...`);

    const saveResult = await runCommand("docker", [
      "save",
      "-o",
      imageTarPath,
      imageName,
    ]);

    if (saveResult.code !== 0) {
      throw new Error(`docker save failed: ${saveResult.stderr}`);
    }

    const imageStats = await stat(imageTarPath);
    console.log(
      `[SnapshotCreate] Exported ${(imageStats.size / 1024 / 1024).toFixed(2)} MB`,
    );

    // Step 7: Compress and store
    if (config.storageType === "s3") {
      await uploadToS3(config, imageTarPath);
    } else {
      await saveToFilesystem(config, imageTarPath);
    }

    // Step 8: Clean up new Docker image (keep storage space down)
    console.log(`[SnapshotCreate] Removing new image ${imageName}...`);
    await runCommand("docker", ["rmi", imageName]);

    // Step 9: Clean up old snapshot image if container was using one
    if (oldImageName.startsWith("pinacle-snapshot:")) {
      console.log(
        `[SnapshotCreate] Cleaning up old snapshot image ${oldImageName}...`,
      );
      const cleanupResult = await runCommand("docker", ["rmi", oldImageName]);
      if (cleanupResult.code === 0) {
        console.log(
          `[SnapshotCreate] Successfully removed old image ${oldImageName}`,
        );
      } else {
        console.warn(
          `[SnapshotCreate] Failed to remove old image (may not exist): ${cleanupResult.stderr}`,
        );
      }
    } else {
      console.log(
        `[SnapshotCreate] Skipping cleanup - container using base image ${oldImageName}`,
      );
    }

    console.log(`[SnapshotCreate] Snapshot created successfully`);

    // Prepare success result (expected by snapshot-service.ts)
    const finalPath =
      config.storageType === "s3"
        ? `${imageTarPath}.gz`
        : join(config.storagePath!, `${config.snapshotId}.tar.gz`);

    const finalStats = await stat(finalPath);

    result = {
      success: true,
      storagePath:
        config.storageType === "s3"
          ? `s3://${config.s3Bucket}/${config.snapshotId}.tar.gz`
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
 * Upload snapshot image to S3
 */
const uploadToS3 = async (
  config: Config,
  imageTarPath: string,
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
  const compressedPath = `${imageTarPath}.gz`;
  await pipeline(
    createReadStream(imageTarPath),
    createGzip(),
    createWriteStream(compressedPath),
  );

  const stats = await stat(compressedPath);
  console.log(
    `[SnapshotCreate] Compressed to ${(stats.size / 1024 / 1024).toFixed(2)} MB`,
  );

  const key = `${config.snapshotId}.tar.gz`;
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
 * Save snapshot image to filesystem
 */
const saveToFilesystem = async (
  config: Config,
  imageTarPath: string,
): Promise<void> => {
  console.log(`[SnapshotCreate] Saving to filesystem...`);

  // Ensure storage directory exists
  await mkdir(config.storagePath!, { recursive: true });

  // Compress and save
  const destPath = join(config.storagePath!, `${config.snapshotId}.tar.gz`);
  await pipeline(
    createReadStream(imageTarPath),
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
