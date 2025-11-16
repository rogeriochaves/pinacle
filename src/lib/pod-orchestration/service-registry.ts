import { getProjectFolderFromRepository } from "../utils";
import type { PodSpec } from "./types";

/**
 * Coding Assistant Metadata
 * Central registry for all coding assistant services with their specific configurations
 */
export type CodingAssistantId =
  | "claude-code"
  | "openai-codex"
  | "cursor-cli"
  | "gemini-cli"
  | "amp-code"
  | "qwen-code";

export type CodingAssistantMetadata = {
  urlParamName: string; // For landing page agent param (e.g., "claude", "openai")
  vibeKanbanExecutor: string; // Executor name for Vibe Kanban config
};

export const CODING_ASSISTANTS: Record<
  CodingAssistantId,
  CodingAssistantMetadata
> = {
  "claude-code": {
    urlParamName: "claude",
    vibeKanbanExecutor: "CLAUDE_CODE",
  },
  "openai-codex": {
    urlParamName: "openai",
    vibeKanbanExecutor: "CODEX",
  },
  "cursor-cli": {
    urlParamName: "cursor",
    vibeKanbanExecutor: "CURSOR",
  },
  "gemini-cli": {
    urlParamName: "gemini",
    vibeKanbanExecutor: "GEMINI",
  },
  "amp-code": {
    urlParamName: "amp",
    vibeKanbanExecutor: "AMP",
  },
  "qwen-code": {
    urlParamName: "qwen",
    vibeKanbanExecutor: "QWEN_CODE",
  },
} as const;

// Helper to check if a service is a coding assistant
export const isCodingAssistant = (
  serviceId: string,
): serviceId is CodingAssistantId => {
  return serviceId in CODING_ASSISTANTS;
};

// Helper to get coding assistant by URL param name
export const getCodingAssistantByUrlParam = (
  urlParam: string,
): CodingAssistantId | undefined => {
  return Object.entries(CODING_ASSISTANTS).find(
    ([_, assistant]) => assistant.urlParamName === urlParam,
  )?.[0] as CodingAssistantId | undefined;
};

// Helper to get all coding assistant service IDs
export const getCodingAssistantIds = (): CodingAssistantId[] => {
  return Object.keys(CODING_ASSISTANTS) as CodingAssistantId[];
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
  installScript: string[] | ((spec: PodSpec) => string[]); // Commands to install service dependencies
  postStartScript?: string[] | ((spec: PodSpec) => string[]); // Commands to install service dependencies
  startCommand: (spec: PodSpec) => string[]; // Function that returns command and args to start the service
  cleanupCommand: string[]; // Commands to run on service stop
  healthCheckStartDelay?: number; // Delay in seconds before health check starts
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
    installScript: [
      "mkdir -p ~/.local/share/code-server/User",
      `cat <<'EOF' > ~/.local/share/code-server/User/settings.json
{
  "files.autoSave": "off",
  "workbench.colorTheme": "Default Dark Modern",
  "security.workspace.trust.enabled": false,
  "editor.minimap.enabled": false,
  "workbench.startupEditor": "none",
  "diffEditor.renderSideBySide": false,
  "diffEditor.hideUnchangedRegions.enabled": true
}
EOF`,
      "mkdir -p ~/.local/share/code-server/extensions",
      "curl -JL https://marketplace.visualstudio.com/_apis/public/gallery/publishers/Supermaven/vsextensions/supermaven/1.1.5/vspackage | bsdtar -xvf - extension",
      "mv extension ~/.local/share/code-server/extensions/supermaven.supermaven-1.1.5-universal",
    ],
    startCommand: (spec: PodSpec) => {
      return [
        "code-server",
        "--bind-addr",
        "0.0.0.0:8726",
        "--trusted-origins",
        "*",
        "--auth",
        "none",
        getProjectFolder(spec),
      ];
    },
    cleanupCommand: [],
    healthCheckStartDelay: 8,
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
    installScript: (spec: PodSpec): string[] => {
      // Find the first coding assistant service and use its Vibe Kanban executor name
      const codingAssistantService = spec.services.find((s) =>
        isCodingAssistant(s.name),
      );
      const codingAssistant = codingAssistantService
        ? CODING_ASSISTANTS[codingAssistantService.name as CodingAssistantId]
            .vibeKanbanExecutor
        : "CLAUDE"; // Default to CLAUDE if no coding assistant found

      return [
        `mkdir -p ~/.local/share/vibe-kanban`,
        `cat <<EOF > ~/.local/share/vibe-kanban/config.json
{
  "config_version": "v7",
  "theme": "SYSTEM",
  "executor_profile": {
    "executor": "${codingAssistant}"
  },
  "disclaimer_acknowledged": true,
  "onboarding_acknowledged": true,
  "github_login_acknowledged": true,
  "telemetry_acknowledged": true,
  "notifications": {
    "sound_enabled": true,
    "push_enabled": true,
    "sound_file": "COW_MOOING"
  },
  "editor": {
    "editor_type": "CUSTOM",
    "custom_command": null
  },
  "github": {
    "pat": null,
    "oauth_token": null,
    "username": null,
    "primary_email": null,
    "default_pr_base": "main"
  },
  "analytics_enabled": false,
  "workspace_dir": null,
  "last_app_version": "$(pnpm show vibe-kanban version)",
  "show_release_notes": false,
  "language": "BROWSER",
  "git_branch_prefix": "vk",
  "showcases": {
    "seen_features": []
  }
}
EOF`,
        `mkdir -p /root/.local/share/vibe-kanban`,
        `ln -s ~/.local/share/vibe-kanban/config.json /root/.local/share/vibe-kanban/config.json`,
      ];
    },
    startCommand: () => ["/root/.local/share/pnpm/vibe-kanban"],
    cleanupCommand: [],
    healthCheckStartDelay: 4,
    healthCheckCommand: ["curl", "-fsSL", "http://localhost:5262"],
    defaultPort: 5262,
    environment: {
      NODE_ENV: "production",
      PORT: "5262",
      HOST: "0.0.0.0",
      GITHUB_CLIENT_ID: "Iv23li8mWSwG4NGXTA3y",
      IS_SANDBOX: "1",
    },
  },

  "claude-code": {
    name: "claude-code",
    displayName: "Claude Code",
    description: "AI coding assistant via terminal",
    icon: "/logos/claude.svg",
    iconAlt: "Claude",
    installScript: [
      "pnpm add -g @anthropic-ai/claude-code@latest",
      "mkdir -p ~/.claude",
      `cat <<EOF > ~/.claude/settings.json
{
  "permissions": {
    "allow": [
      "Bash",
      "WebFetch",
      "WebSearch"
    ],
    "defaultMode": "acceptEdits"
  }
}
EOF`,
    ],
    startCommand: (spec: PodSpec) => {
      return [
        "ttyd",
        "-p",
        "2528",
        "-i",
        "0.0.0.0",
        "-w",
        getProjectFolder(spec),
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
    environment: {},
  },

  "openai-codex": {
    name: "openai-codex",
    displayName: "OpenAI Codex",
    description: "OpenAI powered coding assistant",
    icon: "/logos/openai.svg",
    iconAlt: "OpenAI",
    installScript: (spec: PodSpec) => [
      "pnpm add -g @openai/codex",
      "mkdir -p ~/.codex",
      `cat <<EOF > ~/.codex/config.toml
approval_policy = "never"
sandbox_mode = "danger-full-access"

[projects."${getProjectFolder(spec)}"]
trust_level = "trusted"
EOF`,
    ],
    startCommand: (spec: PodSpec) => {
      return [
        "ttyd",
        "-p",
        "2528",
        "-i",
        "0.0.0.0",
        "-w",
        getProjectFolder(spec),
        "--writable",
        "--",
        "tmux",
        "new",
        "-As",
        "codex",
        "/root/.local/share/pnpm/codex",
      ];
    },
    cleanupCommand: [],
    healthCheckCommand: ["curl", "-fsSL", "http://localhost:2528"],
    defaultPort: 2528,
    environment: {},
  },

  "cursor-cli": {
    name: "cursor-cli",
    displayName: "Cursor CLI",
    description: "Cursor AI coding assistant",
    icon: "/logos/cursor.svg",
    iconAlt: "Cursor",
    installScript: [
      // Install cursor-agent
      "curl https://cursor.com/install -fsS | bash",
      // Alpine Linux compatibility fixes
      `
      # Detect architecture
      ARCH=$(uname -m)
      case "$ARCH" in
        x86_64|amd64) ARCH_NAME="x64" ;;
        aarch64|arm64) ARCH_NAME="arm64" ;;
        *) echo "✗ Unsupported architecture: $ARCH"; exit 1 ;;
      esac
      echo "Detected architecture: $ARCH_NAME"

      # Find the cursor-agent version directory
      CURSOR_VERSION_DIR=$(ls -t /workspace/.local/share/cursor-agent/versions/ | head -1)
      CURSOR_PATH=/workspace/.local/share/cursor-agent/versions/$CURSOR_VERSION_DIR

      # 1. Replace glibc Node.js with Alpine-native Node.js
      if [ -f "$CURSOR_PATH/node" ]; then
        mv "$CURSOR_PATH/node" "$CURSOR_PATH/node.glibc"
        ln -s /usr/local/bin/node "$CURSOR_PATH/node"
        echo "✓ Replaced Node.js binary with Alpine-compatible version"
      fi

      # 2. Patch index.js to stub out merkle-tree native module (glibc-only)
      if [ -f "$CURSOR_PATH/index.js" ]; then
        cp "$CURSOR_PATH/index.js" "$CURSOR_PATH/index.js.backup"
        if [ "$ARCH_NAME" = "arm64" ]; then
          sed -i 's/nativeBinding = __webpack_require__("..\\/merkle-tree\\/merkle-tree-napi.linux-arm64-gnu.node");/nativeBinding = { MerkleClient: class { constructor() {} }, MULTI_ROOT_ABSOLUTE_PATH: "\\/" };/' "$CURSOR_PATH/index.js"
        else
          sed -i 's/nativeBinding = __webpack_require__("..\\/merkle-tree\\/merkle-tree-napi.linux-x64-gnu.node");/nativeBinding = { MerkleClient: class { constructor() {} }, MULTI_ROOT_ABSOLUTE_PATH: "\\/" };/' "$CURSOR_PATH/index.js"
        fi
        echo "✓ Patched merkle-tree module"
      fi

      # 3. Download and replace sqlite3 with musl-compatible version
      if [ -f "$CURSOR_PATH/node_sqlite3.node" ]; then
        cd /tmp
        wget -q https://github.com/TryGhost/node-sqlite3/releases/download/v5.1.7/sqlite3-v5.1.7-napi-v6-linuxmusl-$ARCH_NAME.tar.gz
        tar -xzf sqlite3-v5.1.7-napi-v6-linuxmusl-$ARCH_NAME.tar.gz
        mv "$CURSOR_PATH/node_sqlite3.node" "$CURSOR_PATH/node_sqlite3.node.glibc"
        cp build/Release/node_sqlite3.node "$CURSOR_PATH/node_sqlite3.node"
        rm -rf /tmp/sqlite3-v5.1.7-napi-v6-linuxmusl-$ARCH_NAME.tar.gz /tmp/build
        echo "✓ Replaced sqlite3 with musl-compatible version ($ARCH_NAME)"
      fi

      echo "export NO_OPEN_BROWSER=1" >> /etc/profile
      `,
    ],
    startCommand: (spec: PodSpec) => {
      return [
        "ttyd",
        "-p",
        "2528",
        "-i",
        "0.0.0.0",
        "-w",
        getProjectFolder(spec),
        "--writable",
        "--",
        "tmux",
        "new",
        "-As",
        "cursor",
        "/workspace/.local/bin/cursor-agent",
      ];
    },
    cleanupCommand: [],
    healthCheckCommand: ["curl", "-fsSL", "http://localhost:2528"],
    defaultPort: 2528,
    environment: {},
    requiredEnvVars: [],
  },

  "gemini-cli": {
    name: "gemini-cli",
    displayName: "Gemini CLI",
    description: "Google Gemini coding assistant",
    icon: "/logos/gemini.svg",
    iconAlt: "Gemini",
    installScript: [
      "pnpm add -g @google/gemini-cli",
      // Patch node-pty to skip Debug build check (removes warning)
      `NODE_PTY_FILE=$(find /root/.local/share/pnpm/global -path "*node-pty*/lib/unixTerminal.js" 2>/dev/null | grep -v "@lydell" | head -1)
      if [ -f "$NODE_PTY_FILE" ]; then
        # Comment out the Debug build require to prevent warning
        sed -i "s|pty = require('../build/Debug/pty.node');|// pty = require('../build/Debug/pty.node'); // Patched: skip Debug|" "$NODE_PTY_FILE"
        echo "✓ Patched node-pty to skip Debug build check"
      fi`,
    ],
    startCommand: (spec: PodSpec) => {
      return [
        "ttyd",
        "-p",
        "2528",
        "-i",
        "0.0.0.0",
        "-w",
        getProjectFolder(spec),
        "--writable",
        "--",
        "tmux",
        "new",
        "-As",
        "gemini",
        "/root/.local/share/pnpm/gemini",
        "--yolo",
      ];
    },
    cleanupCommand: [],
    healthCheckCommand: ["curl", "-fsSL", "http://localhost:2528"],
    defaultPort: 2528,
    environment: {},
  },

  "amp-code": {
    name: "amp-code",
    displayName: "Amp Code",
    description: "Amp - AI coding agent by Sourcegraph",
    icon: "/logos/amp.svg",
    iconAlt: "Amp",
    installScript: ["pnpm add -g @sourcegraph/amp"],
    startCommand: (spec: PodSpec) => {
      return [
        "ttyd",
        "-p",
        "2528",
        "-i",
        "0.0.0.0",
        "-w",
        getProjectFolder(spec),
        "--writable",
        "--",
        "tmux",
        "new",
        "-As",
        "amp",
        "/root/.local/share/pnpm/amp",
      ];
    },
    cleanupCommand: [],
    healthCheckCommand: ["curl", "-fsSL", "http://localhost:2528"],
    defaultPort: 2528,
    environment: {},
  },

  "qwen-code": {
    name: "qwen-code",
    displayName: "Qwen Code",
    description:
      "AI coding agent for the open source Qwen family of models by Alibaba",
    icon: "/logos/qwen.png",
    iconAlt: "Qwen",
    installScript: ["pnpm add -g @qwen-code/qwen-code"],
    startCommand: (spec: PodSpec) => {
      return [
        "ttyd",
        "-p",
        "2528",
        "-i",
        "0.0.0.0",
        "-w",
        getProjectFolder(spec),
        "--writable",
        "--",
        "tmux",
        "new",
        "-As",
        "amp",
        "/root/.local/share/pnpm/qwen",
        "--yolo",
      ];
    },
    cleanupCommand: [],
    healthCheckCommand: ["curl", "-fsSL", "http://localhost:2528"],
    defaultPort: 2528,
    environment: {},
  },

  "web-terminal": {
    name: "web-terminal",
    displayName: "Terminal",
    description: "Browser-based terminal with tmux",
    icon: "/window.svg",
    iconAlt: "Terminal",
    installScript: [], // Pre-installed in base image (ttyd)
    startCommand: (spec: PodSpec) => {
      // Pass the tab id as a URL argument, e.g. ?arg=0 for the first tab
      return [
        "ttyd",
        "-p",
        "7681",
        "-i",
        "0.0.0.0",
        "-w",
        getProjectFolder(spec),
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
      "apk add --no-cache postgresql",
      "mkdir -p /var/lib/postgresql/data",
      "chown -R postgres:postgres /var/lib/postgresql",
      "su-exec postgres initdb -D /var/lib/postgresql/data",
      "su-exec postgres pg_ctl -D /var/lib/postgresql/data -o '-c listen_addresses=*' -w start",
    ],
    postStartScript: [
      // Ensure postgres is stopped after install (it will be started by OpenRC)
      "su-exec postgres pg_ctl -D /var/lib/postgresql/data -m fast -w stop || true",
    ],
    startCommand: () => [
      "su-exec",
      "postgres",
      "postgres",
      "-D",
      "/var/lib/postgresql/data",
      "-c",
      "listen_addresses=*",
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

/**
 * Get the project folder or working directory
 */
const getProjectFolder = (spec: PodSpec): string => {
  const projectFolder = getProjectFolderFromRepository(spec.githubRepo);
  return projectFolder ? `/workspace/${projectFolder}` : "/workspace";
};
