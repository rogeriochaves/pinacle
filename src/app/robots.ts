import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://pinacle.dev";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/blog", "/docs", "/privacy", "/terms", "/auth/signin", "/auth/signup"],
        disallow: [
          "/api/",
          "/dashboard/",
          "/admin/",
          "/setup/",
          "/pods/",
          "/team/",
          "/auth/forgot-password",
          "/auth/reset-password",
          "/auth/no-access",
          "/auth/pod-unavailable",
          "/auth/signin-required",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

