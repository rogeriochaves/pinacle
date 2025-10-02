import type { Code2, Cpu, Terminal, Zap } from "lucide-react";
import type { ResourceTier, ServiceConfig } from "./types";

/**
 * Template definition that combines bundle info (pricing, display)
 * with pod configuration (resources, services, environment)
 */
export type PodTemplate = {
  // Bundle/Display information
  id: string;
  name: string;
  description: string;
  icon?: typeof Zap | typeof Code2 | typeof Terminal | typeof Cpu;
  category: string;
  popular?: boolean;
  pricePerMonth: number;

  // Pod configuration
  baseImage: string;
  tier: ResourceTier;
  cpuCores: number;
  memoryGb: number;
  storageGb: number;

  // Services and setup
  services: string[]; // Service names to enable
  serviceConfigs?: ServiceConfig[]; // Optional custom service configs
  defaultPorts: Array<{ name: string; internal: number; external?: number }>;
  environment: Record<string, string>;
  requiredEnvVars: string[];

  // Template initialization
  templateType: "blank" | "vite" | "nextjs" | "nodejs" | "python" | "custom";
  initScript?: string[]; // Commands to run after cloning/creating repo
};

/**
 * Central registry of all pod templates
 * Used by both frontend (bundles) and backend (pod orchestration)
 */
export const POD_TEMPLATES: Record<string, PodTemplate> = {
  vite: {
    id: "vite",
    name: "Vite Starter",
    description:
      "A lightweight environment for frontend development with Vite.",
    category: "frontend",
    popular: true,
    pricePerMonth: 6,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.small",
    cpuCores: 1,
    memoryGb: 1,
    storageGb: 10,

    services: ["code-server", "vibe-kanban", "claude-code", "web-terminal"],
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
    requiredEnvVars: ["ANTHROPIC_API_KEY"],

    templateType: "vite",
    initScript: [
      "cd /workspace",
      "npm create vite@latest . -- --template react-ts",
      "npm install",
    ],
  },

  nextjs: {
    id: "nextjs",
    name: "Next.js",
    description: "Full-stack Next.js environment with database support.",
    category: "fullstack",
    pricePerMonth: 12,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.medium",
    cpuCores: 1,
    memoryGb: 2,
    storageGb: 20,

    services: ["code-server", "vibe-kanban", "claude-code", "web-terminal"],
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
    requiredEnvVars: ["ANTHROPIC_API_KEY", "NEXTAUTH_SECRET", "DATABASE_URL"],

    templateType: "nextjs",
    initScript: [
      "cd /workspace",
      "npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias '@/*' --no-git",
      "npm install",
    ],
  },

  nodejs: {
    id: "nodejs",
    name: "Node.js",
    description: "Node.js backend development environment.",
    category: "backend",
    pricePerMonth: 12,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.medium",
    cpuCores: 1,
    memoryGb: 1.5,
    storageGb: 10,

    services: ["code-server", "claude-code", "web-terminal"],
    defaultPorts: [
      { name: "api", internal: 8000 },
      { name: "code", internal: 8726 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {
      NODE_ENV: "development",
      PORT: "8000",
    },
    requiredEnvVars: ["ANTHROPIC_API_KEY"],

    templateType: "nodejs",
    initScript: [
      "cd /workspace",
      "npm init -y",
      "npm install express",
      "echo 'console.log(\"Hello from Node.js!\")' > index.js",
    ],
  },

  "custom-setup": {
    id: "custom-setup",
    name: "Custom Setup",
    description: "A blank Ubuntu environment for full customization.",
    category: "custom",
    pricePerMonth: 6,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.small",
    cpuCores: 1,
    memoryGb: 1,
    storageGb: 10,

    services: ["code-server", "vibe-kanban", "claude-code", "web-terminal"],
    defaultPorts: [
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {},
    requiredEnvVars: ["ANTHROPIC_API_KEY"],

    templateType: "blank",
    // No init script - just blank workspace
  },

  "power-user": {
    id: "power-user",
    name: "Power User",
    description: "High-performance environment for demanding applications.",
    category: "custom",
    pricePerMonth: 24,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.large",
    cpuCores: 2,
    memoryGb: 4,
    storageGb: 50,

    services: ["code-server", "vibe-kanban", "claude-code", "web-terminal"],
    defaultPorts: [
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {},
    requiredEnvVars: ["ANTHROPIC_API_KEY"],

    templateType: "custom",
  },

  "python-datascience": {
    id: "python-datascience",
    name: "Python Data Science",
    description: "Python environment with Jupyter, pandas, and ML libraries.",
    category: "datascience",
    pricePerMonth: 24,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.large",
    cpuCores: 2,
    memoryGb: 4,
    storageGb: 20,

    services: ["code-server", "claude-code", "web-terminal"],
    defaultPorts: [
      { name: "jupyter", internal: 8888 },
      { name: "code", internal: 8726 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {
      JUPYTER_ENABLE_LAB: "yes",
      JUPYTER_TOKEN: "",
      PYTHON_ENV: "development",
      PYTHONPATH: "/workspace",
    },
    requiredEnvVars: ["ANTHROPIC_API_KEY"],

    templateType: "python",
    initScript: [
      "cd /workspace",
      "python3 -m venv venv",
      "source venv/bin/activate",
      "pip install jupyter pandas numpy matplotlib scikit-learn",
    ],
  },

  "mastra-ai": {
    id: "mastra-ai",
    name: "Mastra AI Agent",
    description: "Build AI agents with Mastra framework.",
    category: "ai",
    pricePerMonth: 12,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.medium",
    cpuCores: 1.5,
    memoryGb: 2,
    storageGb: 15,

    services: ["code-server", "vibe-kanban", "claude-code", "web-terminal"],
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
    requiredEnvVars: ["ANTHROPIC_API_KEY"],

    templateType: "python",
    initScript: ["cd /workspace", "pip install mastra", "mastra init"],
  },
};

/**
 * Get template by ID
 */
export const getTemplate = (templateId: string): PodTemplate | undefined => {
  return POD_TEMPLATES[templateId];
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
