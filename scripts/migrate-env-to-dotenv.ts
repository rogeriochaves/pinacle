#!/usr/bin/env tsx
/**
 * Migration script to convert existing JSON env vars to dotenv format
 *
 * This script:
 * 1. Finds all env_sets with JSON format variables
 * 2. Converts them to dotenv format
 * 3. Updates the database
 *
 * Run with: pnpm tsx scripts/migrate-env-to-dotenv.ts
 *
 * Options:
 *   --dry-run    Preview changes without applying them
 *   --verbose    Show detailed output
 */

import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { dotenvs } from "../src/lib/db/schema";
import {
  calculateEnvHash,
  formatAsDotenv,
  isJsonFormat,
} from "../src/lib/dotenv";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isVerbose = args.includes("--verbose");

const log = (message: string) => console.log(message);
const verbose = (message: string) => {
  if (isVerbose) console.log(`  ${message}`);
};

const main = async () => {
  log("🔄 Starting env_set migration to dotenv format...\n");

  if (isDryRun) {
    log("⚠️  DRY RUN MODE - No changes will be made\n");
  }

  // Fetch all env sets
  const allEnvSets = await db.select().from(dotenvs);

  log(`📊 Found ${allEnvSets.length} dotenv(s) in database\n`);

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const dotenv of allEnvSets) {
    const { id, name, content } = dotenv;

    verbose(`Processing dotenv: ${name} (${id})`);

    // Check if it's already in dotenv format
    if (!isJsonFormat(content)) {
      verbose(`  ⏭️  Already in dotenv format, skipping`);
      skippedCount++;
      continue;
    }

    // Try to parse and convert
    try {
      const parsed = JSON.parse(content) as Record<string, string>;
      const envVarCount = Object.keys(parsed).length;

      if (envVarCount === 0) {
        verbose(`  ⏭️  Empty env vars, skipping`);
        skippedCount++;
        continue;
      }

      // Generate dotenv content with comments
      const dotenvContent = generateMigrationDotenv(name, parsed);

      verbose(`  📝 Converting ${envVarCount} variable(s) to dotenv format`);

      if (isVerbose) {
        console.log(`  --- Preview ---`);
        console.log(
          dotenvContent
            .split("\n")
            .map((l) => `    ${l}`)
            .join("\n"),
        );
        console.log(`  ---------------`);
      }

      if (!isDryRun) {
        // Calculate hash for the new content
        const contentHash = await calculateEnvHash(dotenvContent);

        // Update the database
        await db
          .update(dotenvs)
          .set({
            content: dotenvContent,
            contentHash,
            lastModifiedSource: "db",
            updatedAt: new Date(),
          })
          .where(eq(dotenvs.id, id));

        log(`✅ Migrated: ${name} (${id}) - ${envVarCount} variable(s)`);
      } else {
        log(`🔍 Would migrate: ${name} (${id}) - ${envVarCount} variable(s)`);
      }

      migratedCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`❌ Error processing ${name} (${id}): ${message}`);
      errorCount++;
    }
  }

  log("\n📊 Migration Summary:");
  log(`   ✅ Migrated: ${migratedCount}`);
  log(`   ⏭️  Skipped (already dotenv): ${skippedCount}`);
  log(`   ❌ Errors: ${errorCount}`);

  if (isDryRun && migratedCount > 0) {
    log("\n💡 Run without --dry-run to apply these changes");
  }

  log("\n✨ Done!");
};

/**
 * Generate dotenv content with migration header
 */
const generateMigrationDotenv = (
  envSetName: string,
  vars: Record<string, string>,
): string => {
  const lines: string[] = [];

  lines.push("# ===========================================");
  lines.push(`# Environment Variables`);
  lines.push(`# Migrated from JSON format`);
  lines.push("# ===========================================");
  lines.push("");
  lines.push("# This file is automatically synced with your Pinacle pod.");
  lines.push("# Edit here or in your .env file inside the container.");
  lines.push("");

  // Group variables by type
  const secrets: [string, string][] = [];
  const dbVars: [string, string][] = [];
  const otherVars: [string, string][] = [];

  for (const [key, value] of Object.entries(vars)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("secret") ||
      lowerKey.includes("key") ||
      lowerKey.includes("token") ||
      lowerKey.includes("password")
    ) {
      secrets.push([key, value]);
    } else if (
      lowerKey.includes("database") ||
      lowerKey.includes("postgres") ||
      lowerKey.includes("mysql") ||
      lowerKey.includes("redis") ||
      lowerKey.includes("mongo")
    ) {
      dbVars.push([key, value]);
    } else {
      otherVars.push([key, value]);
    }
  }

  // Add database variables
  if (dbVars.length > 0) {
    lines.push("# Database");
    lines.push("# --------");
    for (const [key, value] of dbVars) {
      lines.push(`${key}=${formatValue(value)}`);
    }
    lines.push("");
  }

  // Add secrets
  if (secrets.length > 0) {
    lines.push("# Secrets & API Keys");
    lines.push("# ------------------");
    for (const [key, value] of secrets) {
      lines.push(`${key}=${formatValue(value)}`);
    }
    lines.push("");
  }

  // Add other variables
  if (otherVars.length > 0) {
    if (secrets.length > 0 || dbVars.length > 0) {
      lines.push("# Other Variables");
      lines.push("# ---------------");
    }
    for (const [key, value] of otherVars) {
      lines.push(`${key}=${formatValue(value)}`);
    }
    lines.push("");
  }

  lines.push("# Custom Variables");
  lines.push("# ----------------");
  lines.push("# Add your own environment variables below:");
  lines.push("");

  return lines.join("\n");
};

/**
 * Format a value for dotenv, quoting if necessary
 */
const formatValue = (value: string): string => {
  if (
    value.includes(" ") ||
    value.includes("\n") ||
    value.includes('"') ||
    value.includes("'") ||
    value.includes("#") ||
    value.includes("$")
  ) {
    // Escape double quotes and use double quotes
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
};

// Run the migration
main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
