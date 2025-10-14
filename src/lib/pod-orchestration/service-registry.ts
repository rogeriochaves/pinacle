/**
 * Context passed to startCommand function
 */
export type ServiceContext = {
  projectFolder?: string; // Project folder for the cloned repo
  workingDir?: string; // Working directory override
};

/**
 * Service template definition
 * Defines how to install, start, stop, and monitor a service
 */
export type ServiceTemplate = {
  name: string;
  displayName: string;
  description: string;
  icon?: string; // Path to icon for UI display
  iconAlt?: string; // Alt text for icon
  installScript: string[]; // Commands to install service dependencies
  startCommand: (context: ServiceContext) => string[]; // Function that returns command and args to start the service
  cleanupCommand: string[]; // Commands to run on service stop
  healthCheckCommand: string[]; // Command to check if service is healthy
  defaultPort: number; // Default port the service listens on
  environment?: Record<string, string>; // Environment variables for the service
  requiredEnvVars?: string[]; // Required environment variables from user
};

/**
 * Central registry of all service templates
 * Used by ServiceProvisioner to install and manage services
 */
export const SERVICE_TEMPLATES = {
  "code-server": {
    name: "code-server",
    displayName: "VS Code",
    description: "VS Code in the browser",
    icon: "/logos/vscode.svg",
    iconAlt: "VS Code",
    installScript: [], // Pre-installed in base image
    startCommand: (context: ServiceContext) => {
      const workingDir = context.projectFolder
        ? `/workspace/${context.projectFolder}`
        : "/workspace";

      return [
        "code-server",
        "--bind-addr",
        "0.0.0.0:8726",
        "--trusted-origins",
        "*",
        "--auth",
        "none",
        workingDir,
      ];
    },
    cleanupCommand: [],
    healthCheckCommand: ["curl", "-fsSL", "http://localhost:8726"],
    defaultPort: 8726,
    environment: {
      PORT: "8726",
    },
  },

  "vibe-kanban": {
    name: "vibe-kanban",
    displayName: "Vibe Kanban",
    description: "Kanban board for project management",
    icon: "/logos/vibe-kanban.svg",
    iconAlt: "Vibe",
    installScript: [], // Pre-installed in base image
    startCommand: () => ["vibe-kanban"],
    cleanupCommand: [],
    healthCheckCommand: ["curl", "-fsSL", "http://localhost:5262"],
    defaultPort: 5262,
    environment: {
      NODE_ENV: "production",
      PORT: "5262",
      HOST: "0.0.0.0",
      IS_SANDBOX: "1",
    },
  },

  "claude-code": {
    name: "claude-code",
    displayName: "Claude Code",
    description: "AI coding assistant via terminal",
    icon: "/logos/claude.svg",
    iconAlt: "Claude",
    installScript: ["pnpm install -g @anthropic-ai/claude-code"],
    startCommand: (context: ServiceContext) => {
      const workingDir = context.projectFolder
        ? `/workspace/${context.projectFolder}`
        : "/workspace";

      return [
        "ttyd",
        "-p",
        "2528",
        "-i",
        "0.0.0.0",
        "-w",
        workingDir,
        "--writable",
        "--",
        "tmux",
        "new",
        "-As",
        "claude",
        "/root/.local/share/pnpm/claude",
      ];
    },
    cleanupCommand: [],
    healthCheckCommand: ["curl", "-fsSL", "http://localhost:2528"],
    defaultPort: 2528,
    environment: {
      IS_SANDBOX: "1",
    },
    requiredEnvVars: ["ANTHROPIC_API_KEY"],
  },

  "openai-codex": {
    name: "openai-codex",
    displayName: "OpenAI Codex",
    description: "OpenAI powered coding assistant",
    icon: "/logos/openai.svg",
    iconAlt: "OpenAI",
    installScript: ["pip install openai"],
    startCommand: (context: ServiceContext) => {
      const workingDir = context.projectFolder
        ? `/workspace/${context.projectFolder}`
        : "/workspace";

      return [
        "ttyd",
        "-p",
        "2528",
        "-i",
        "0.0.0.0",
        "-w",
        workingDir,
        "--writable",
        "--",
        "bash",
      ];
    },
    cleanupCommand: [],
    healthCheckCommand: ["curl", "-fsSL", "http://localhost:2528"],
    defaultPort: 2528,
    environment: {
      IS_SANDBOX: "1",
    },
    requiredEnvVars: ["OPENAI_API_KEY"],
  },

  "cursor-cli": {
    name: "cursor-cli",
    displayName: "Cursor CLI",
    description: "Cursor AI coding assistant",
    icon: "/logos/cursor.svg",
    iconAlt: "Cursor",
    installScript: ["npm install -g cursor-cli"],
    startCommand: (context: ServiceContext) => {
      const workingDir = context.projectFolder
        ? `/workspace/${context.projectFolder}`
        : "/workspace";

      return [
        "ttyd",
        "-p",
        "2528",
        "-i",
        "0.0.0.0",
        "-w",
        workingDir,
        "--writable",
        "--",
        "bash",
      ];
    },
    cleanupCommand: [],
    healthCheckCommand: ["curl", "-fsSL", "http://localhost:2528"],
    defaultPort: 2528,
    environment: {
      IS_SANDBOX: "1",
    },
    requiredEnvVars: [],
  },

  "gemini-cli": {
    name: "gemini-cli",
    displayName: "Gemini CLI",
    description: "Google Gemini coding assistant",
    icon: "/logos/gemini.svg",
    iconAlt: "Gemini",
    installScript: ["pip install google-generativeai"],
    startCommand: (context: ServiceContext) => {
      const workingDir = context.projectFolder
        ? `/workspace/${context.projectFolder}`
        : "/workspace";

      return [
        "ttyd",
        "-p",
        "2528",
        "-i",
        "0.0.0.0",
        "-w",
        workingDir,
        "--writable",
        "--",
        "bash",
      ];
    },
    cleanupCommand: [],
    healthCheckCommand: ["curl", "-fsSL", "http://localhost:2528"],
    defaultPort: 2528,
    environment: {
      IS_SANDBOX: "1",
    },
    requiredEnvVars: ["GEMINI_API_KEY"],
  },

  "web-terminal": {
    name: "web-terminal",
    displayName: "Terminal",
    description: "Browser-based terminal with tmux",
    icon: "/window.svg",
    iconAlt: "Terminal",
    installScript: [], // Pre-installed in base image (ttyd)
    startCommand: (context: ServiceContext) => {
      const workingDir = context.projectFolder
        ? `/workspace/${context.projectFolder}`
        : "/workspace";

      return [
        "ttyd",
        "-p",
        "7681",
        "-i",
        "0.0.0.0",
        "-w",
        workingDir,
        "--writable",
        "--url-arg",
        "--",
        "tmux",
        "new",
        "-As",
      ];
    },
    cleanupCommand: [],
    healthCheckCommand: ["curl", "-fsSL", "http://localhost:7681"],
    defaultPort: 7681,
  },

  // Future services can be added here:

  postgres: {
    name: "postgres",
    displayName: "PostgreSQL",
    description: "PostgreSQL database server",
    icon: "/file.svg",
    iconAlt: "PostgreSQL",
    installScript: [
      "apk add --no-cache postgresql postgresql-contrib",
      "mkdir -p /var/lib/postgresql/data",
      "chown -R postgres:postgres /var/lib/postgresql",
    ],
    startCommand: () => [
      "su-exec",
      "postgres",
      "postgres",
      "-D",
      "/var/lib/postgresql/data",
    ],
    cleanupCommand: [],
    healthCheckCommand: ["pg_isready", "-U", "postgres"],
    defaultPort: 5432,
    environment: {
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: "postgres",
      POSTGRES_DB: "postgres",
    },
  },

  redis: {
    name: "redis",
    displayName: "Redis",
    description: "In-memory data store",
    icon: "/file.svg",
    iconAlt: "Redis",
    installScript: ["apk add --no-cache redis"],
    startCommand: () => ["redis-server", "--bind", "0.0.0.0"],
    cleanupCommand: [],
    healthCheckCommand: ["redis-cli", "ping"],
    defaultPort: 6379,
  },

  jupyter: {
    name: "jupyter",
    displayName: "Jupyter Lab",
    description: "Interactive notebook environment",
    icon: "/file.svg",
    iconAlt: "Jupyter",
    installScript: ["pip install jupyter jupyterlab pandas numpy matplotlib"],
    startCommand: () => [
      "jupyter",
      "lab",
      "--ip=0.0.0.0",
      "--port=8888",
      "--no-browser",
      "--allow-root",
      "--NotebookApp.token=''",
      "--NotebookApp.password=''",
    ],
    cleanupCommand: [],
    healthCheckCommand: ["curl", "-fsSL", "http://localhost:8888"],
    defaultPort: 8888,
    environment: {
      JUPYTER_ENABLE_LAB: "yes",
    },
  },
} satisfies Record<string, ServiceTemplate>;

/**
 * Type-safe service name
 */
export type ServiceId = keyof typeof SERVICE_TEMPLATES;

/**
 * Get service template by name (type-safe)
 */
export const getServiceTemplate = (serviceName: ServiceId): ServiceTemplate => {
  return SERVICE_TEMPLATES[serviceName];
};

/**
 * Get service template by name (unsafe, for external input)
 */
export const getServiceTemplateUnsafe = (
  serviceName: string,
): ServiceTemplate | undefined => {
  return SERVICE_TEMPLATES[serviceName as ServiceId];
};

/**
 * Get all service templates
 */
export const getAllServiceTemplates = (): ServiceTemplate[] => {
  return Object.values(SERVICE_TEMPLATES);
};

/**
 * Get all service names
 */
export const getAllServiceNames = (): string[] => {
  return Object.keys(SERVICE_TEMPLATES);
};

/**
 * Check if a service is available
 */
export const isServiceAvailable = (serviceName: string): boolean => {
  return serviceName in SERVICE_TEMPLATES;
};
