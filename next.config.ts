import { withPostHogConfig } from "@posthog/nextjs-config";
import { execSync } from "child_process";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    incomingRequests: {
      ignore: [/\/api\/trpc\/servers.reportMetrics/],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "s3.nl-ams.scw.cloud",
        pathname: "/pinacle/**",
      },
      {
        protocol: "https",
        hostname: "s3.nl-ams.scw.cloud",
        pathname: "/pinacle-dev/**",
      },
    ],
  },
  // Externalize geoip-country to allow it to load database files
  serverExternalPackages: ["geoip-country"],
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
};

const GIT_COMMIT_HASH = execSync("git rev-parse HEAD").toString().trim();

// Check if git working directory is dirty
// git diff --quiet exits with 1 if there are changes, 0 if clean
let IS_DIRTY = false;
try {
  execSync("git diff --quiet", { stdio: "ignore" });
  IS_DIRTY = false; // Exit code 0 = clean
} catch {
  IS_DIRTY = true; // Exit code 1 = dirty
}

export default withPostHogConfig(nextConfig, {
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY || "",
  envId: process.env.POSTHOG_ENV_ID || "",
  host: "https://eu.i.posthog.com",
  logLevel: "error",
  sourcemaps: {
    enabled:
      process.env.NODE_ENV === "production" &&
      !!process.env.POSTHOG_PERSONAL_API_KEY &&
      !!process.env.POSTHOG_ENV_ID,
    project: "pinacle",
    deleteAfterUpload: true,
    version: `${GIT_COMMIT_HASH}${IS_DIRTY ? "-dirty" : ""}`,
  },
});
