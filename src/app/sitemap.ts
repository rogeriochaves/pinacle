import fs from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { defaultLocale, locales } from "@/i18n";

const baseUrl = "https://pinacle.dev";

// Get all blog post slugs
const getBlogPosts = (): string[] => {
  try {
    const blogDir = path.join(process.cwd(), "content/blog");
    const files = fs.readdirSync(blogDir);
    return files
      .filter((file) => file.endsWith(".mdx") || file.endsWith(".md"))
      .map((file) => file.replace(/\.(mdx|md)$/, ""));
  } catch (error) {
    console.error("Error reading blog posts:", error);
    return [];
  }
};

export default function sitemap(): MetadataRoute.Sitemap {
  const blogPosts = getBlogPosts();

  // Public pages that should be in the sitemap
  const publicPages = [
    { path: "", priority: 1.0, changeFreq: "daily" as const },
    { path: "/blog", priority: 0.9, changeFreq: "daily" as const },
    { path: "/docs", priority: 0.8, changeFreq: "weekly" as const },
    { path: "/pricing", priority: 0.8, changeFreq: "monthly" as const },
    { path: "/privacy", priority: 0.5, changeFreq: "monthly" as const },
    { path: "/terms", priority: 0.5, changeFreq: "monthly" as const },
    { path: "/auth/signin", priority: 0.7, changeFreq: "monthly" as const },
    { path: "/auth/signup", priority: 0.7, changeFreq: "monthly" as const },
  ];

  const sitemap: MetadataRoute.Sitemap = [];

  // Add all public pages for all locales
  for (const page of publicPages) {
    for (const locale of locales) {
      const url =
        locale === defaultLocale
          ? `${baseUrl}${page.path}`
          : `${baseUrl}/${locale}${page.path}`;

      sitemap.push({
        url,
        lastModified: new Date(),
        changeFrequency: page.changeFreq,
        priority: page.priority,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [
              l,
              l === defaultLocale
                ? `${baseUrl}${page.path}`
                : `${baseUrl}/${l}${page.path}`,
            ]),
          ),
        },
      });
    }
  }

  // Add blog posts for all locales
  for (const slug of blogPosts) {
    for (const locale of locales) {
      const url =
        locale === defaultLocale
          ? `${baseUrl}/blog/${slug}`
          : `${baseUrl}/${locale}/blog/${slug}`;

      sitemap.push({
        url,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [
              l,
              l === defaultLocale
                ? `${baseUrl}/blog/${slug}`
                : `${baseUrl}/${l}/blog/${slug}`,
            ]),
          ),
        },
      });
    }
  }

  return sitemap;
}
