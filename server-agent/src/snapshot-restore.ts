#!/usr/bin/env node
/**
 * Snapshot Restore Script
 *
 * Restores a gVisor container snapshot by loading the Docker image.
 * The image was created during snapshot with all changes baked into layers.
 *
 * Usage:
 *   snapshot-restore --snapshot-id <id> --storage-type <s3|filesystem> [options]
 *
 * Returns: JSON with the image name to use for container creation
 */

import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

type Config = {
  snapshotId: string;
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

  if (!config.snapshotId || !config.storageType) {
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
 * Restore snapshot by loading the Docker image
 */
const restoreSnapshot = async (config: Config): Promise<string> => {
  console.log(`[SnapshotRestore] Restoring snapshot ${config.snapshotId}`);

  // Create temp directory
  const tempDir = join(tmpdir(), `pinacle-restore-${config.snapshotId}`);
  await mkdir(tempDir, { recursive: true });

  try {
    // Step 1: Download/decompress snapshot image
    const imageTarPath = join(tempDir, "snapshot-image.tar");

    if (config.storageType === "s3") {
      await downloadFromS3(config, imageTarPath);
    } else {
      await loadFromFilesystem(config, imageTarPath);
    }

    console.log(`[SnapshotRestore] Snapshot downloaded to ${imageTarPath}`);

    // Step 2: Load image using docker load
    const imageName = `pinacle-snapshot:${config.snapshotId}`;
    console.log(`[SnapshotRestore] Loading image as ${imageName}...`);

    const loadResult = await runCommand("docker", ["load", "-i", imageTarPath]);

    if (loadResult.code !== 0) {
      throw new Error(`docker load failed: ${loadResult.stderr}`);
    }

    console.log(`[SnapshotRestore] Image loaded successfully`);

    // Step 3: Tag the loaded image with our expected name
    // docker load outputs the image name, but we want a consistent name
    const loadedImageMatch = loadResult.stdout.match(/Loaded image: (.+)/);
    if (loadedImageMatch?.[1]) {
      const loadedImageName = loadedImageMatch[1].trim();
      console.log(`[SnapshotRestore] Loaded image: ${loadedImageName}`);

      // Tag it with our expected name
      const tagResult = await runCommand("docker", [
        "tag",
        loadedImageName,
        imageName,
      ]);

      if (tagResult.code !== 0) {
        console.warn(
          `[SnapshotRestore] Failed to tag image: ${tagResult.stderr}`,
        );
        // Continue anyway, use the loaded name
        return JSON.stringify({ success: true, imageName: loadedImageName });
      }
    }

    // Return the image name for container creation
    return JSON.stringify({ success: true, imageName });
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
