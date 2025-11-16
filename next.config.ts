import { readFileSync } from "node:fs";
import { withPostHogConfig } from "@posthog/nextjs-config";
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

const GIT_COMMIT_HASH =
  process.env.NODE_ENV === "production"
    ? readFileSync(".git-commit-hash", "utf-8").trim()
    : "dev";

export default withPostHogConfig(nextConfig, {
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY || "",
  envId: process.env.POSTHOG_ENV_ID || "",
  host: "https://eu.i.posthog.com",
  logLevel: "error",
  sourcemaps: {
    enabled:
    false && // disable for now
      process.env.NODE_ENV === "production" &&
      !!process.env.POSTHOG_PERSONAL_API_KEY &&
      !!process.env.POSTHOG_ENV_ID,
    project: "pinacle",
    deleteAfterUpload: true,
    version: GIT_COMMIT_HASH,
  },
});
