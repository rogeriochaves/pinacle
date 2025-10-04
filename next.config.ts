import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    incomingRequests: {
      ignore: [/\/api\/trpc\/servers.reportMetrics/],
    },
  },
};

export default nextConfig;
