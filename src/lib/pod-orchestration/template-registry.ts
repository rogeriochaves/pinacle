import type { TierId } from "./resource-tier-registry";
import type { ServiceId } from "./service-registry";
import {
  getServiceTemplateUnsafe,
  isCodingAssistant,
} from "./service-registry";
import type { PodSpec, ServiceConfig } from "./types";

export type TemplateId =
  | "vite"
  | "nextjs"
  | "mastra-ai"
  | "nodejs-blank"
  | "python-blank"
  | "agno"
  | "nextjs-chatbot"
  | "n8n";

/**
 * Template definition that combines bundle info (pricing, display)
 * with pod configuration (resources, services, environment)
 */
export type PodTemplate = {
  // Display/Marketing information (frontend only)
  id: TemplateId;
  name: string;
  icon?: string; // Path to icon image (e.g., "/logos/vite.svg")
  iconAlt?: string; // Alt text for icon
  techStack?: string; // Tech stack description for landing page
  mainUseCaseKey?: string; // Translation key for main use case (e.g., "templates.buildWebsites")
  category: string;
  popular?: boolean;

  // Pod configuration
  baseImage: string;
  tier: TierId;
  cpuCores: number;
  memoryGb: number;
  storageGb: number;

  // Services and setup (actual backend services)
  services: ServiceId[]; // Service names to enable (from SERVICE_TEMPLATES) - also displayed as tools in UI
  serviceConfigs?: ServiceConfig[]; // Optional custom service configs
  defaultPorts: Array<{ name: string; internal: number; external?: number }>;
  environment: Record<string, string>;
  generateDefaultEnv?: () => string; // Returns the full default .env file content

  // Installation and user processes
  installCommand?: string | string[];
  defaultProcesses?: Array<{
    name: string;
    startCommand: string | string[];
    url?: string;
    healthCheck?: string | string[];
  }>;

  // Template initialization
  templateType: "blank" | "vite" | "nextjs" | "nodejs" | "python" | "custom";
  initScript?: string[] | ((spec: PodSpec) => string[]); // Commands to run after cloning/creating repo
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

export const sedReplace = (
  file: string,
  pattern: string,
  replacement: string,
) => {
  const escapeString = (str: string) =>
    str
      .replaceAll(/\\/g, "\\\\")
      .replaceAll(/`/g, "\\`")
      .replaceAll(/\$/g, "\\$")
      .replaceAll(/"/g, '\\"')
      .replaceAll(/\n/g, "\\n");
  const escapedPattern = escapeString(pattern);
  const escapedReplacement = escapeString(replacement);
  return `sed -i "s/${escapedPattern}/${escapedReplacement}/g" ${file}`;
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
    mainUseCaseKey: "templates.buildWebsites",
    category: "frontend",
    popular: true,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.small",
    cpuCores: 1,
    memoryGb: 1,
    storageGb: 10,

    services: ["claude-code", "vibe-kanban", "code-server", "web-terminal"],
    defaultPorts: [
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {},

    installCommand: "pnpm install",
    defaultProcesses: [
      {
        name: "app",
        startCommand: "pnpm dev",
        url: "http://localhost:5173",
        healthCheck: "curl -f http://localhost:5173",
      },
    ],

    templateType: "vite",
    initScript: (spec: PodSpec): string[] => {
      // Find the first coding assistant service and use its display name
      const codingAssistantService = spec.services.find((s) =>
        isCodingAssistant(s.name),
      );
      const codingAssistant = codingAssistantService
        ? getServiceTemplateUnsafe(codingAssistantService.name)?.displayName ||
          "Claude Code"
        : "Claude Code"; // Default to Claude Code if no coding assistant found

      return [
        // 1. Create Vite project
        "pnpm create vite@latest . --rolldown --no-interactive --template react-ts",
        "pnpm install",

        // 2. Patch package.json to bind Vite to 0.0.0.0
        `sed -i 's/"dev": "vite"/"dev": "vite --host 0.0.0.0"/' package.json`,

        // 3. Install Tailwind CSS v4
        "pnpm add -D tailwindcss @tailwindcss/vite",

        // 4. Update vite.config.ts to include Tailwind plugin
        `sed -i "s/import { defineConfig } from 'vite'/import { defineConfig } from 'vite'\\nimport tailwindcss from '@tailwindcss\\/vite'/" vite.config.ts`,
        `sed -i 's/plugins: \\[react()\\]/plugins: [react(), tailwindcss()]/' vite.config.ts`,

        // 5. Replace index.css with Tailwind imports
        `echo '@import "tailwindcss";' > src/index.css`,

        // 6. Install shadcn dependencies
        "pnpm add class-variance-authority clsx tailwind-merge lucide-react",

        // 7. Create lib/utils.ts for shadcn
        "mkdir -p src/lib",
        `cat > src/lib/utils.ts << 'EOF'
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};
EOF`,

        // 8. Replace App.tsx with welcome page
        `cat > src/App.tsx << 'EOF'
import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          {/* Logos */}
          <div className="flex justify-center gap-8 mb-8">
            <a
              href="https://vite.dev"
              target="_blank"
              className="transition-transform hover:scale-110"
            >
              <img src={viteLogo} className="h-24 w-24" alt="Vite logo" />
            </a>
            <a
              href="https://react.dev"
              target="_blank"
              className="transition-transform hover:scale-110"
            >
              <img
                src={reactLogo}
                className="h-24 w-24 animate-spin"
                style={{ animationDuration: "20s" }}
                alt="React logo"
              />
            </a>
          </div>

          {/* Main Content */}
          <div className="text-center space-y-8">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
              Your Pinacle Vite Template is Ready! 🚀
            </h1>

            <p className="text-xl text-gray-600">
              This template includes:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">⚡ Vite + React</h3>
                <p className="text-sm text-gray-600">Lightning-fast HMR with Rolldown</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">🎨 Tailwind CSS v4</h3>
                <p className="text-sm text-gray-600">Latest version with @tailwindcss/vite</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">🧩 shadcn/ui Ready</h3>
                <p className="text-sm text-gray-600">Pre-configured with utils & dependencies</p>
              </div>
            </div>

            {/* Interactive Demo */}
            <div className="border border-gray-200 rounded-lg p-8">
              <button
                onClick={() => setCount((count) => count + 1)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Count is {count}
              </button>
              <p className="mt-4 text-gray-600">
                Edit <code className="bg-gray-100 px-2 py-1 rounded text-sm">src/App.tsx</code> and save to test HMR
              </p>
            </div>

            {/* Next Steps */}
            <div className="mt-12 p-6 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-lg text-gray-900 font-medium mb-2">
                Ready to start building?
              </p>
              <p className="text-gray-700">
                Go to the <span className="font-semibold">${codingAssistant}</span> or{" "}
                <span className="font-semibold">VS Code</span> tab above and start building! 💻
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
EOF`,

        // 9. Clean up App.css (not needed with Tailwind)
        "rm -f src/App.css",
      ];
    },
  },

  nextjs: {
    id: "nextjs",
    name: "Next.js SaaS Starter",
    icon: "/logos/nextjs.svg",
    iconAlt: "Next.js",
    techStack: "React, TypeScript, Tailwind CSS, NextAuth, PostgreSQL, Stripe",
    mainUseCaseKey: "templates.buildSaas",
    category: "fullstack",

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.medium",
    cpuCores: 1,
    memoryGb: 2,
    storageGb: 20,

    services: [
      "claude-code",
      "vibe-kanban",
      "code-server",
      "web-terminal",
      "postgres",
    ],
    defaultPorts: [
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
      { name: "postgres", internal: 5432 },
    ],
    environment: {},
    generateDefaultEnv: () =>
      `# Next.js SaaS Starter Environment Variables
# https://github.com/nextjs/saas-starter

# Authentication
# Generate with: openssl rand -base64 32
AUTH_SECRET=${generateRandomSecret(32)}

# Database
POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres

# Stripe (use test keys for development)
# Get your keys at: https://dashboard.stripe.com/test/apikeys
STRIPE_SECRET_KEY=sk_test_${generateRandomSecret(24)}
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
`.trim(),

    installCommand: "pnpm install && pnpm db:migrate",
    defaultProcesses: [
      {
        name: "app",
        startCommand: "pnpm dev",
        url: "http://localhost:3000",
        healthCheck: "curl -f http://localhost:3000",
      },
    ],
    templateType: "nextjs",
    initScript: [
      // 1. Clone the Next.js SaaS Starter
      "git clone https://github.com/nextjs/saas-starter.git temp-saas-starter",
      "rm -rf temp-saas-starter/.git",
      "mv temp-saas-starter/* .",
      "mv temp-saas-starter/.* . 2>/dev/null || true",
      "rm -rf temp-saas-starter",

      // 2. Install dependencies
      "pnpm install",

      // 3. Wait for Postgres to be ready
      "until pg_isready -h localhost -U postgres; do echo 'Waiting for postgres...'; sleep 2; done",

      // 4. Run database migrations
      "pnpm db:migrate",
    ],
  },

  "mastra-ai": {
    id: "mastra-ai",
    name: "Mastra",
    icon: "/logos/mastra.svg",
    iconAlt: "Mastra",
    techStack: "TypeScript, Mastra, Mastra Playground",
    mainUseCaseKey: "templates.buildAiAgents",
    category: "ai",

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.medium",
    cpuCores: 1.5,
    memoryGb: 2,
    storageGb: 15,

    services: ["claude-code", "vibe-kanban", "code-server", "web-terminal"],
    defaultPorts: [
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {},

    installCommand: "uv sync",
    defaultProcesses: [
      {
        name: "app",
        startCommand: "uv run mastra dev",
        url: "http://localhost:8000",
        healthCheck: "curl -f http://localhost:8000",
      },
    ],

    templateType: "python",
    initScript: ["cd /workspace", "pip install mastra", "mastra init"],
  },

  "nodejs-blank": {
    id: "nodejs-blank",
    name: "Node.js",
    icon: "/logos/nodejs.svg",
    iconAlt: "Node.js",
    techStack: "Node.js, pnpm",
    mainUseCaseKey: "templates.customBackend",
    category: "backend",
    popular: false,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.small",
    cpuCores: 0.5,
    memoryGb: 1,
    storageGb: 10,

    services: ["claude-code", "vibe-kanban", "code-server", "web-terminal"],
    defaultPorts: [
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {},
    installCommand: "pnpm install",
    defaultProcesses: [
      {
        name: "app",
        startCommand: "pnpm dev",
        url: "http://localhost:3000",
      },
    ],

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
    mainUseCaseKey: "templates.customPython",
    category: "backend",
    popular: false,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.small",
    cpuCores: 0.5,
    memoryGb: 1,
    storageGb: 10,

    services: ["claude-code", "vibe-kanban", "code-server", "web-terminal"],
    defaultPorts: [
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {},

    installCommand: "uv sync",
    defaultProcesses: [
      {
        name: "app",
        startCommand: "uv run python main.py",
        url: "http://localhost:8000",
      },
    ],

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
    mainUseCaseKey: "templates.buildAiAgents",
    category: "ai",
    popular: false,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.medium",
    cpuCores: 1,
    memoryGb: 2,
    storageGb: 20,

    services: ["claude-code", "vibe-kanban", "code-server", "web-terminal"],
    defaultPorts: [
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {},
    generateDefaultEnv: () =>
      `# Agno AgentUI Environment Variables
# https://docs.agno.com/basics/agent-ui/overview

# OpenAI API Key
OPENAI_API_KEY="add your OpenAI API key here"
`.trim(),

    installCommand: "uv sync && cd agent-ui && pnpm install",
    defaultProcesses: [
      {
        name: "app",
        startCommand: `cd agent-ui && pnpm dev`,
        url: "http://localhost:3000",
        healthCheck: "curl -f http://localhost:3000",
      },
      {
        name: "backend",
        startCommand: `uv run python my_os.py`,
        url: "http://localhost:7777",
        healthCheck: "curl -f http://localhost:7777",
      },
    ],

    templateType: "python",
    initScript: [
      "uv init .",
      `cat > .gitignore << 'EOF'
# Byte-compiled / optimized / DLL files
__pycache__/
*.py[cod]
*$py.class
*.pyc

# Distribution / packaging
build/
dist/
eggs/
*.egg-info/
*.egg

# Virtual environments
.venv/
venv/
ENV/

# Environment variables
.env
.env.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# Database files
*.db
*.sqlite
*.sqlite3

# Misc
.DS_Store
*.log
EOF`,
      "uv add agno 'fastapi[standard]' uvicorn openai sqlalchemy aiosqlite greenlet",
      `cat > my_os.py << 'EOF'
from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.db.sqlite import AsyncSqliteDb
from agno.os import AgentOS

import dotenv

dotenv.load_dotenv()

assistant = Agent(
    name="Assistant",
    model=OpenAIChat(id="gpt-5-mini"),
    db=AsyncSqliteDb(db_file="my_os.db"),
    instructions=["You are a helpful AI assistant."],
    markdown=True,
)

agent_os = AgentOS(
    id="my-first-os",
    description="My first AgentOS",
    agents=[assistant],
)

app = agent_os.get_app()

if __name__ == "__main__":
    # Default port is 7777; change with port=...
    agent_os.serve(app="my_os:app", reload=True)
EOF`,
      "yes | pnpx create-agent-ui@latest",
      `sed -i "s/devIndicators: false/devIndicators: false,\\n    async rewrites() {\\n      return [\\n        {\\n          source: '\\\\/agent\\\\/:path*',\\n          destination: 'http:\\/\\/localhost:7777\\\\/:path*',\\n        },\\n      ]\\n    },/" agent-ui/next.config.ts`,
      `sed -i "s/selectedEndpoint: 'http:\\/\\/localhost:7777',/selectedEndpoint: process.env.NEXT_PUBLIC_PINACLE_POD_HOST ? \\\`\\\${typeof window !== 'undefined' ? window.location.protocol : 'https:'}\\/\\/localhost-3000-\\\${process.env.NEXT_PUBLIC_PINACLE_POD_HOST}\\/agent\\\` : 'http:\\/\\/localhost:7777',/" agent-ui/src/store.ts`,
    ],
  },

  "nextjs-chatbot": {
    id: "nextjs-chatbot",
    name: "Next.js AI Chatbot",
    icon: "/logos/nextjs.svg",
    iconAlt: "Next.js",
    techStack: "AI SDK, Next.js, TypeScript, Tailwind CSS, PostgreSQL",
    mainUseCaseKey: "templates.buildAiAgents",
    category: "ai",
    popular: false,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.medium",
    cpuCores: 1,
    memoryGb: 2,
    storageGb: 20,

    services: [
      "claude-code",
      "vibe-kanban",
      "code-server",
      "web-terminal",
      "postgres",
    ],
    defaultPorts: [
      { name: "code", internal: 8726 },
      { name: "kanban", internal: 5262 },
      { name: "claude", internal: 2528 },
      { name: "terminal", internal: 7681 },
      { name: "postgres", internal: 5432 },
    ],
    environment: {},
    generateDefaultEnv: () =>
      `# Vercel AI Chatbot Environment Variables
# https://github.com/vercel/ai-chatbot

# Authentication
# Generate a random secret: https://generate-secret.vercel.app/32 or \`openssl rand -base64 32\`
AUTH_SECRET=${generateRandomSecret(32)}

# Database
POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres

# AI Provider (choose one or more)

# Create a Vercel AI Gateway API key here: https://vercel.com/ai-gateway
# AI_GATEWAY_API_KEY=xxx

# Or use OpenAI: https://platform.openai.com/api-keys
# OPENAI_API_KEY=sk-xxx

# Or Anthropic: https://console.anthropic.com/
# ANTHROPIC_API_KEY=sk-ant-xxx
`.trim(),

    installCommand: "pnpm install && pnpm db:migrate",
    defaultProcesses: [
      {
        name: "app",
        startCommand: "pnpm dev",
        url: "http://localhost:3000",
        healthCheck: "curl -f http://localhost:3000",
      },
    ],

    templateType: "nextjs",
    initScript: [
      // 1. Clone the Vercel AI Chatbot
      "git clone https://github.com/vercel/ai-chatbot.git temp-ai-chatbot",
      "rm -rf temp-ai-chatbot/.git",
      "mv temp-ai-chatbot/* .",
      "mv temp-ai-chatbot/.* . 2>/dev/null || true",
      "rm -rf temp-ai-chatbot",

      // 2. Patch migrate.ts to use .env instead of .env.local (Pinacle uses .env)
      "sed -i 's/.env.local/.env/g' lib/db/migrate.ts",

      // 3. Patch middleware.ts to use secure cookies when behind HTTPS proxy (Pinacle)
      // Original: secureCookie: !isDevelopmentEnvironment
      // Patched: secureCookie: true if X-Forwarded-Proto is 'https', else fallback to original behavior
      `sed -i "s/secureCookie: !isDevelopmentEnvironment/secureCookie: request.headers.get('x-forwarded-proto') === 'https' || !isDevelopmentEnvironment/g" middleware.ts`,

      // 4. Install dependencies
      "pnpm install",

      // 5. Wait for Postgres to be ready
      "until pg_isready -h localhost -U postgres; do echo 'Waiting for postgres...'; sleep 2; done",

      // 6. Run database migrations
      "pnpm db:migrate",
    ],
  },

  n8n: {
    id: "n8n",
    name: "n8n",
    icon: "/logos/n8n.svg",
    iconAlt: "n8n",
    techStack: "Node.js, n8n",
    mainUseCaseKey: "templates.buildAiAutomations",
    category: "ai",
    popular: false,

    baseImage: "pinacledev/pinacle-base",
    tier: "dev.small",
    cpuCores: 0.5,
    memoryGb: 1,
    storageGb: 10,

    services: ["claude-code", "code-server", "web-terminal", "vibe-kanban"],
    defaultPorts: [
      { name: "code", internal: 8726 },
      { name: "terminal", internal: 7681 },
    ],
    environment: {},
    generateDefaultEnv: () =>
      `# n8n Environment Variables
# https://docs.n8n.io/hosting/configuration/environment-variables/

N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=false
`.trim(),
    installCommand: "npm install --loglevel=verbose",
    defaultProcesses: [
      {
        name: "n8n",
        startCommand: "npm start",
        url: "http://localhost:5678",
        healthCheck: "curl -f http://localhost:5678/healthz",
      },
    ],

    templateType: "nodejs",
    initScript: [
      "npm init -y",
      "npm install n8n sqlite3 --loglevel=verbose",
      `cat > .gitignore << 'EOF'
node_modules/

# Environment variables
.env
.env.*
!.env.example
EOF`,
      sedReplace(
        "package.json",
        '"scripts": {',
        '"scripts": {\n    "start": "n8n start",',
      ),
    ],
  },
} satisfies Record<TemplateId, PodTemplate>;

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
  "n8n",
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
