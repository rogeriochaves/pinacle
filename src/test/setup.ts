// Test setup file
import { config } from "dotenv";
import { afterAll, beforeAll } from "vitest";

// Load environment variables from .env.local (or .env if not found)
// This matches Next.js behavior where .env.local takes precedence
config({ path: ".env.local" });
config(); // Also load .env as fallback

beforeAll(async () => {
  // Global test setup
  console.log("Setting up test environment...");
  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("GITHUB_APP_SLUG:", process.env.GITHUB_APP_SLUG);
  console.log("Platform:", process.platform);
});

afterAll(async () => {
  // Global test cleanup
  console.log("Cleaning up test environment...");
});
