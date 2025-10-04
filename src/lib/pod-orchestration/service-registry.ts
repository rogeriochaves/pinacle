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
  image?: string; // Optional Docker image for sidecar services
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
export const SERVICE_TEMPLATES: Record<string, ServiceTemplate> = {
  "code-server": {
    name: "code-server",
    displayName: "VS Code Server",
    description: "VS Code in the browser",
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

  "web-terminal": {
    name: "web-terminal",
    displayName: "Web Terminal",
    description: "Browser-based terminal with tmux",
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
};

/**
 * Get service template by name
 */
export const getServiceTemplate = (
  serviceName: string,
): ServiceTemplate | undefined => {
  return SERVICE_TEMPLATES[serviceName];
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
