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
};

export default nextConfig;
