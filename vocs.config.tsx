// biome-ignore lint/correctness/noUnusedImports: necessary for Vocs
import React from "react";
import { defineConfig } from "vocs";

const baseUrl = "https://pinacle.dev";

export default defineConfig({
  title: "Pinacle Docs",
  description: "Documentation for Pinacle - Dev boxes for AI coding agents",
  basePath: "/docs",
  baseUrl,

  logoUrl: "/logo.png",
  head: (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
    </>
  ),
  iconUrl: "/favicon.ico",
  sidebar: [
    {
      text: "Introduction",
      link: "/",
    },
    {
      text: "Getting Started",
      link: "/getting-started",
    },
    {
      text: "Core Concepts",
      items: [
        {
          text: "Templates",
          link: "/templates",
        },
        {
          text: "Services",
          link: "/services",
        },
        {
          text: "Resource Tiers",
          link: "/resource-tiers",
        },
      ],
    },
    {
      text: "Features",
      items: [
        {
          text: "Snapshots",
          link: "/snapshots",
        },
        {
          text: "GitHub Integration",
          link: "/github",
        },
        {
          text: "Environment Variables",
          link: "/environment-variables",
        },
        {
          text: "Pinacle Runtime Variables",
          link: "/runtime-variables",
        },
        {
          text: "Supermaven",
          link: "/supermaven",
        },
      ],
    },
    {
      text: "Configuration",
      items: [
        {
          text: "pinacle.yaml",
          link: "/pinacle-yaml",
        },
      ],
    },
    {
      text: "Billing",
      link: "/billing",
    },
  ],
});
