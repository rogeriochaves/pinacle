#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const HASH_FILE = join(process.cwd(), "docs", "dist", ".build-hash");
const DOCS_DIR = join(process.cwd(), "docs");
const VOCS_CONFIG = join(process.cwd(), "vocs.config.tsx");

/**
 * Recursively get all files in a directory, excluding dist/
 */
const getAllFiles = async (
  dir: string,
  files: string[] = [],
): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip dist directory
      if (entry.name === "dist") continue;
      await getAllFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }

  return files;
};

/**
 * Calculate hash of all relevant files
 */
const calculateHash = async (): Promise<string> => {
  const hash = createHash("sha256");

  // Hash all files in docs/ (excluding dist/)
  const docsFiles = await getAllFiles(DOCS_DIR);
  docsFiles.sort(); // Ensure consistent ordering

  for (const file of docsFiles) {
    const content = await readFile(file, "utf-8");
    hash.update(file);
    hash.update(content);
  }

  // Hash vocs.config.tsx
  const vocsConfig = await readFile(VOCS_CONFIG, "utf-8");
  hash.update(VOCS_CONFIG);
  hash.update(vocsConfig);

  return hash.digest("hex");
};

/**
 * Read previous hash from dist/.build-hash
 */
const getPreviousHash = async (): Promise<string | null> => {
  try {
    return await readFile(HASH_FILE, "utf-8");
  } catch {
    return null;
  }
};

/**
 * Save current hash to dist/.build-hash
 */
const saveHash = async (hash: string): Promise<void> => {
  await mkdir(join(DOCS_DIR, "dist"), { recursive: true });
  await writeFile(HASH_FILE, hash, "utf-8");
};

/**
 * Main function
 */
const main = async () => {
  console.log("Checking if docs build is needed...");

  const currentHash = await calculateHash();
  const previousHash = await getPreviousHash();

  if (currentHash === previousHash) {
    console.log("✓ Docs unchanged, skipping build");
    return;
  }

  console.log("Building docs...");
  execSync("vocs build", { stdio: "inherit" });

  await saveHash(currentHash);
  console.log("✓ Docs built successfully");
};

main().catch((err) => {
  console.error("Error building docs:", err);
  process.exit(1);
});
