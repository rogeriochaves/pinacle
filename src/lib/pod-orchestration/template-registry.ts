import type { TierId } from "./resource-tier-registry";
import type { ServiceName } from "./service-registry";
import type { ServiceConfig } from "./types";

/**
 * Template definition that combines bundle info (pricing, display)
 * with pod configuration (resources, services, environment)
 */
export type PodTemplate = {
  // Display/Marketing information (frontend only)
  id: string;
  name: string;
  icon?: string; // Path to icon image (e.g., "/logos/vite.svg")
  iconAlt?: string; // Alt text for icon
  techStack?: string; // Tech stack description for landing page
  mainUseCase?: string; // Main use case description (e.g., "For building websites")
  category: string;
  popular?: boolean;

  // Pod configuration
  baseImage: string;
  tier: TierId;
  cpuCores: number;
  memoryGb: number;
  storageGb: number;

  // Services and setup (actual backend services)
  services: ServiceName[]; // Service names to enable (from SERVICE_TEMPLATES) - also displayed as tools in UI
  serviceConfigs?: ServiceConfig[]; // Optional custom service configs
  defaultPorts: Array<{ name: string; internal: number; external?: number }>;
  environment: Record<string, string>;
  requiredEnvVars: string[];
  envVarDefaults?: Record<string, string | (() => string)>; // Default values or generator functions for env vars

  // Template initialization
  templateType: "blank" | "vite" | "nextjs" | "nodejs" | "python" | "custom";
  initScript?: string[]; // Commands to run after cloning/creating repo
};

/**
 * Generate a random hex string (equivalent to openssl rand -hex 32)
 */
export const generateRandomSecret = (bytes = 32): string => {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
};

/**
 * Central registry of all pod templates
 * Used by both frontend (bundles) and backend (pod orchestration)
 */
export const POD_TEMPLATES = {
  vite: {
    id: "vite",
    name: "Vite Template",
    icon: "/logos/vite.svg",
    iconAlt: "Vite",
    techStack: "React, TypeScript, Tailwind CSS",
    mainUseCase: "For building websites",
    category: "frontend",
    popular: true,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.small",
    cpuCores: 1,
    memoryGb: 1,
    storageGb: 10,

    services: ["claude-code", "vibe-kanban", "code-server", "web-terminal"],
    defaultPorts: [
      { name: "app", internal: 5173 }, // Vite default port
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {
      NODE_ENV: "development",
      PORT: "5173",
    },
    requiredEnvVars: [],

    templateType: "vite",
    initScript: [
      "cd /workspace",
      "npm create vite@latest . -- --template react-ts",
      "npm install",
    ],
  },

  nextjs: {
    id: "nextjs",
    name: "Next.js T3 Stack",
    icon: "/logos/nextjs.svg",
    iconAlt: "Next.js",
    techStack: "React, TypeScript, Tailwind CSS, NextAuth, PostgreSQL, tRPC",
    mainUseCase: "For building SaaS applications",
    category: "fullstack",

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.medium",
    cpuCores: 1,
    memoryGb: 2,
    storageGb: 20,

    services: ["claude-code", "vibe-kanban", "code-server", "web-terminal"],
    defaultPorts: [
      { name: "app", internal: 3000 },
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {
      NODE_ENV: "development",
      PORT: "3000",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    requiredEnvVars: ["NEXTAUTH_SECRET", "DATABASE_URL"],
    envVarDefaults: {
      NEXTAUTH_SECRET: () => generateRandomSecret(32),
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/app",
    },

    templateType: "nextjs",
    initScript: [
      "cd /workspace",
      "npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias '@/*' --no-git",
      "npm install",
    ],
  },

  "mastra-ai": {
    id: "mastra-ai",
    name: "Mastra",
    icon: "/logos/mastra.svg",
    iconAlt: "Mastra",
    techStack: "TypeScript, Mastra, Mastra Playground",
    mainUseCase: "For building AI agents",
    category: "ai",

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.medium",
    cpuCores: 1.5,
    memoryGb: 2,
    storageGb: 15,

    services: ["claude-code", "vibe-kanban", "code-server", "web-terminal"],
    defaultPorts: [
      { name: "app", internal: 8000 },
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {
      PYTHON_ENV: "development",
      PYTHONPATH: "/workspace",
    },
    requiredEnvVars: [],

    templateType: "python",
    initScript: ["cd /workspace", "pip install mastra", "mastra init"],
  },

  "nodejs-blank": {
    id: "nodejs-blank",
    name: "Node.js",
    icon: "/logos/nodejs.svg",
    iconAlt: "Node.js",
    techStack: "Node.js, pnpm",
    mainUseCase: "For custom backend development",
    category: "backend",
    popular: false,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.small",
    cpuCores: 0.5,
    memoryGb: 1,
    storageGb: 10,

    services: ["claude-code", "vibe-kanban", "code-server", "web-terminal"],
    defaultPorts: [
      { name: "app", internal: 3000 },
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {
      NODE_ENV: "development",
    },
    requiredEnvVars: [],

    templateType: "nodejs",
    initScript: [
      "cd /workspace",
      "npm init -y",
      "echo 'console.log(\"Hello from Node.js!\")' > index.js",
    ],
  },

  "python-blank": {
    id: "python-blank",
    name: "Python",
    icon: "/logos/python.svg",
    iconAlt: "Python",
    techStack: "Python, uv",
    mainUseCase: "For custom Python development",
    category: "backend",
    popular: false,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.small",
    cpuCores: 0.5,
    memoryGb: 1,
    storageGb: 10,

    services: ["claude-code", "vibe-kanban", "code-server", "web-terminal"],
    defaultPorts: [
      { name: "app", internal: 8000 },
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {
      PYTHON_ENV: "development",
      PYTHONPATH: "/workspace",
    },
    requiredEnvVars: [],

    templateType: "python",
    initScript: [
      "cd /workspace",
      "python3 -m venv venv",
      "echo 'print(\"Hello from Python!\")' > main.py",
    ],
  },

  agno: {
    id: "agno",
    name: "Agno",
    icon: "/logos/agno.svg",
    iconAlt: "Agno",
    techStack: "Python, FastAPI, Agno, AgentUI",
    mainUseCase: "For building AI agents",
    category: "ai",
    popular: false,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.small",
    cpuCores: 0.5,
    memoryGb: 1,
    storageGb: 10,

    services: ["claude-code", "vibe-kanban", "code-server", "web-terminal"],
    defaultPorts: [
      { name: "app", internal: 8000 },
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {
      PYTHON_ENV: "development",
      PYTHONPATH: "/workspace",
    },
    requiredEnvVars: [],

    templateType: "python",
    initScript: [
      "cd /workspace",
      "python3 -m venv venv",
      "source venv/bin/activate",
      "pip install agno fastapi uvicorn",
    ],
  },

  "nextjs-chatbot": {
    id: "nextjs-chatbot",
    name: "Next.js AI Chatbot",
    icon: "/logos/nextjs.svg",
    iconAlt: "Next.js",
    techStack: "AI SDK, Next.js, TypeScript, Tailwind CSS",
    mainUseCase: "For building AI agents",
    category: "ai",
    popular: false,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.small",
    cpuCores: 0.5,
    memoryGb: 1,
    storageGb: 10,

    services: ["claude-code", "vibe-kanban", "code-server", "web-terminal"],
    defaultPorts: [
      { name: "app", internal: 3000 },
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {
      NODE_ENV: "development",
      PORT: "3000",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    requiredEnvVars: [],

    templateType: "nextjs",
    initScript: [
      "cd /workspace",
      "npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias '@/*' --no-git",
      "npm install ai @ai-sdk/anthropic",
    ],
  },

  langflow: {
    id: "langflow",
    name: "Langflow",
    icon: "/logos/langflow.svg",
    iconAlt: "Langflow",
    techStack: "Python, Langflow",
    mainUseCase: "For building AI automations",
    category: "ai",
    popular: false,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.small",
    cpuCores: 0.5,
    memoryGb: 1,
    storageGb: 10,

    services: ["code-server", "web-terminal"],
    defaultPorts: [
      { name: "langflow", internal: 7860 },
      { name: "code", internal: 8726 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {
      PYTHON_ENV: "development",
      PYTHONPATH: "/workspace",
      LANGFLOW_DATABASE_URL: "sqlite:///./langflow.db",
    },
    requiredEnvVars: [],

    templateType: "python",
    initScript: [
      "cd /workspace",
      "python3 -m venv venv",
      "source venv/bin/activate",
      "pip install langflow",
    ],
  },
} satisfies Record<string, PodTemplate>;

/**
 * Type-safe template ID
 */
export type TemplateId = keyof typeof POD_TEMPLATES;

/**
 * List of templates to show publicly in UI
 * Order matches landing page exactly - no more, no less
 */
export const PUBLIC_TEMPLATES = [
  "vite",
  "nextjs",
  "agno",
  "mastra-ai",
  "nextjs-chatbot",
  "langflow",
  "nodejs-blank",
  "python-blank",
] as const;

/**
 * Get all public templates
 */
export const getPublicTemplates = (): PodTemplate[] => {
  return PUBLIC_TEMPLATES.map((id) => POD_TEMPLATES[id]).filter(Boolean);
};

/**
 * Get template by ID (type-safe)
 */
export const getTemplate = (templateId: TemplateId): PodTemplate => {
  return POD_TEMPLATES[templateId];
};

/**
 * Get template by ID (unsafe, for external input)
 */
export const getTemplateUnsafe = (
  templateId: string,
): PodTemplate | undefined => {
  return POD_TEMPLATES[templateId as TemplateId];
};

/**
 * Get all templates
 */
export const getAllTemplates = (): PodTemplate[] => {
  return Object.values(POD_TEMPLATES);
};

/**
 * Get templates by category
 */
export const getTemplatesByCategory = (category: string): PodTemplate[] => {
  return getAllTemplates().filter((t) => t.category === category);
};

/**
 * Get popular templates
 */
export const getPopularTemplates = (): PodTemplate[] => {
  return getAllTemplates().filter((t) => t.popular);
};
