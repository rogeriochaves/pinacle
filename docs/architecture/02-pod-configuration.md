# Pod Configuration System

## Overview

The pod configuration system uses YAML files (`pinacle.yaml`) stored in user repositories to define pod setup, runtime configuration, and service requirements. This approach enables version control, portability, and infrastructure-as-code practices.

## Configuration Schema

### Complete pinacle.yaml Structure

```yaml
# pinacle.yaml - Pod Configuration File
version: "1.0"

# Pod metadata
metadata:
  name: "my-nextjs-app"                    # Pod display name
  description: "Next.js e-commerce app"    # Optional description
  template: "nextjs"                       # Base template to extend
  tier: "dev.medium"                       # Resource tier (can be overridden)

# Runtime configuration
runtime:
  # Base image/environment
  base: "ubuntu:22.04"                     # Base OS image

  # Project setup
  project:
    # Repository settings (auto-detected if in repo)
    repository: "github.com/user/repo"     # Optional, auto-detected
    branch: "main"                         # Default branch
    path: "/"                              # Project path in repo

    # Build configuration
    build:
      # Package manager detection (auto-detected)
      packageManager: "pnpm"               # npm, yarn, pnpm, bun

      # Install command (auto-generated if not specified)
      install: "pnpm install"

      # Build command (optional)
      build: "pnpm run build"

      # Post-install hooks
      postInstall:
        - "pnpm db:migrate"
        - "pnpm db:seed"

    # Start configuration
    start:
      # Development server
      dev:
        command: "pnpm run dev"
        port: 3000
        healthCheck:
          path: "/"
          interval: 30
          timeout: 5
          retries: 3

      # Production server (optional)
      prod:
        command: "pnpm start"
        port: 3000

      # Additional processes
      workers:
        - name: "queue-worker"
          command: "pnpm run worker"
          autoRestart: true

# Services configuration
services:
  # AI Assistant
  ai:
    provider: "claude"                     # claude, openai, copilot
    model: "claude-3-opus"                 # Optional model specification
    features:
      - "code-completion"
      - "chat"
      - "terminal-commands"

  # Development tools
  tools:
    - name: "vibe-kanban"
      enabled: true
      port: 3001
      config:
        projectName: "${POD_NAME}"

    - name: "code-server"
      enabled: true
      port: 8080
      config:
        extensions:
          - "dbaeumer.vscode-eslint"
          - "esbenp.prettier-vscode"
          - "prisma.prisma"
        settings:
          "editor.formatOnSave": true
          "editor.defaultFormatter": "esbenp.prettier-vscode"

# Port exposure configuration
ports:
  # Application ports
  - name: "app"
    internal: 3000
    external: auto                        # Auto-assign external port
    subdomain: "${POD_NAME}"              # username-podname.pinacle.dev
    auth: true                            # Require authentication
    public: false                         # Public access (overrides auth)

  - name: "api"
    internal: 8000
    external: auto
    subdomain: "${POD_NAME}-api"
    auth: true

  # Tool ports (auto-configured from services)
  - name: "vibe-kanban"
    internal: 3001
    external: auto
    subdomain: "${POD_NAME}-kanban"
    auth: true

  - name: "code-server"
    internal: 8080
    external: auto
    subdomain: "${POD_NAME}-code"
    auth: true

# Environment variables
environment:
  # Required variables (user must provide)
  required:
    - name: "ANTHROPIC_API_KEY"
      description: "API key for Claude AI"
      service: "ai"                       # Links to service config

    - name: "DATABASE_URL"
      description: "PostgreSQL connection string"
      default: "postgresql://localhost:5432/myapp"

  # Optional variables with defaults
  variables:
    - name: "NODE_ENV"
      value: "development"

    - name: "NEXT_PUBLIC_APP_URL"
      value: "https://${POD_SUBDOMAIN}.pinacle.dev"

    - name: "PORT"
      value: "${PORT_APP}"                # Reference to port config

  # Secrets (stored encrypted, shared across pods for same project)
  secrets:
    - name: "NEXTAUTH_SECRET"
      generate: true                      # Auto-generate if not exists
      length: 32

    - name: "JWT_SECRET"
      shared: true                        # Share across team pods

# Resource requirements
resources:
  tier: "dev.medium"                      # Default tier

  # Custom resource allocation (overrides tier)
  custom:
    cpu: 1.5                             # vCPUs
    memory: 3072                         # MB
    storage: 30                          # GB

  # Auto-scaling (future feature)
  autoscale:
    enabled: false
    minCpu: 0.5
    maxCpu: 2
    targetCpuPercent: 70

# Tabs configuration for UI
tabs:
  default:
    - id: "app"
      type: "browser"
      name: "Application"
      url: "https://${POD_SUBDOMAIN}.pinacle.dev"
      icon: "globe"

    - id: "kanban"
      type: "browser"
      name: "Vibe Kanban"
      url: "https://${POD_SUBDOMAIN}-kanban.pinacle.dev"
      icon: "kanban"

    - id: "code"
      type: "browser"
      name: "VS Code"
      url: "https://${POD_SUBDOMAIN}-code.pinacle.dev"
      icon: "code"

    - id: "claude"
      type: "terminal"
      name: "Claude Code"
      command: "claude-code"
      icon: "bot"

    - id: "terminal"
      type: "terminal"
      name: "Terminal"
      command: "bash"
      icon: "terminal"

  # Allow custom tabs
  allowCustom: true
  maxTabs: 10

# Health monitoring
monitoring:
  enabled: true

  # Service health checks
  checks:
    - name: "app-health"
      type: "http"
      url: "http://localhost:3000/api/health"
      interval: 60
      timeout: 10

    - name: "database"
      type: "tcp"
      host: "localhost"
      port: 5432
      interval: 30

  # Alerts
  alerts:
    - condition: "cpu > 90"
      duration: 300                       # 5 minutes
      action: "notify"

    - condition: "memory > 95"
      duration: 60
      action: "restart"

    - condition: "disk > 90"
      action: "notify"

# Lifecycle hooks
hooks:
  # Pre-start hooks
  preStart:
    - "echo 'Starting pod ${POD_NAME}'"

  # Post-start hooks
  postStart:
    - "curl -X POST https://api.pinacle.dev/webhooks/pod-started"

  # Pre-stop hooks
  preStop:
    - "pnpm run cleanup"

  # Scheduled tasks (cron)
  scheduled:
    - name: "backup"
      schedule: "0 2 * * *"               # Daily at 2 AM
      command: "pnpm run backup"

# Advanced configuration
advanced:
  # Network configuration
  network:
    dns:
      - "8.8.8.8"
      - "8.8.4.4"
    proxy:
      http: "${HTTP_PROXY}"
      https: "${HTTPS_PROXY}"
      noProxy: "localhost,127.0.0.1"

  # Security settings
  security:
    readOnlyRootFilesystem: false
    allowPrivilegeEscalation: false
    runAsNonRoot: true
    capabilities:
      drop:
        - "ALL"
      add:
        - "NET_BIND_SERVICE"

  # Custom mounts
  mounts:
    - source: "/data/shared"
      target: "/mnt/shared"
      readOnly: true
```

## Configuration Inheritance and Templates

### Base Templates

Templates are stored in the codebase at `/templates/pods/`:

```typescript
// /templates/pods/nextjs.yaml
export const nextjsTemplate = `
version: "1.0"
metadata:
  template: "nextjs"
  tier: "dev.small"

runtime:
  base: "node:24-alpine"
  project:
    build:
      packageManager: "pnpm"
      install: "pnpm install"
      build: "pnpm run build"
    start:
      dev:
        command: "pnpm run dev"
        port: 3000

services:
  ai:
    provider: "claude"
  tools:
    - name: "vibe-kanban"
      enabled: true
    - name: "code-server"
      enabled: true

ports:
  - name: "app"
    internal: 3000
    auth: true

environment:
  required:
    - name: "ANTHROPIC_API_KEY"
  variables:
    - name: "NODE_ENV"
      value: "development"
  secrets:
    - name: "NEXTAUTH_SECRET"
      generate: true
`;
```

### Template Categories

```typescript
enum TemplateCategory {
  // Frontend frameworks
  NEXTJS = "nextjs",
  VITE = "vite",
  REACT = "react",
  VUE = "vue",
  ANGULAR = "angular",
  SVELTE = "svelte",

  // Backend frameworks
  EXPRESS = "express",
  FASTIFY = "fastify",
  NESTJS = "nestjs",
  DJANGO = "django",
  FLASK = "flask",
  RAILS = "rails",

  // Full-stack
  REMIX = "remix",
  NUXT = "nuxt",
  SVELTEKIT = "sveltekit",

  // CMS
  WORDPRESS = "wordpress",
  STRAPI = "strapi",
  DIRECTUS = "directus",

  // Custom
  BLANK = "blank",
  CUSTOM = "custom"
}
```

## Configuration Resolution

### Priority Order

1. User's `pinacle.yaml` in repository
2. User's custom configuration in UI
3. Template defaults
4. System defaults

### Merge Strategy

```typescript
interface ConfigMergeStrategy {
  // Deep merge objects
  metadata: "merge",
  runtime: "merge",
  services: "merge",

  // Replace arrays
  ports: "replace",
  environment: "replace",

  // Append arrays
  hooks: "append",
  tabs: "append"
}
```

## Auto-Detection System

### Project Type Detection

```typescript
interface ProjectDetector {
  detect(repoPath: string): Promise<ProjectType>;
}

class SmartProjectDetector implements ProjectDetector {
  private detectors = [
    new PackageJsonDetector(),    // Node.js projects
    new ComposerJsonDetector(),   // PHP projects
    new RequirementsTxtDetector(), // Python projects
    new GemfileDetector(),        // Ruby projects
    new PomXmlDetector(),         // Java projects
    new CargoTomlDetector(),      // Rust projects
    new GoModDetector(),          // Go projects
  ];

  async detect(repoPath: string): Promise<ProjectType> {
    // Run detectors in parallel
    const results = await Promise.all(
      this.detectors.map(d => d.detect(repoPath))
    );

    // Return highest confidence match
    return results
      .filter(r => r.confidence > 0.5)
      .sort((a, b) => b.confidence - a.confidence)[0];
  }
}
```

### AI-Powered Detection

```typescript
class AIProjectAnalyzer {
  async analyze(repoPath: string): Promise<PodSpec> {
    const files = await this.scanRepository(repoPath);

    const prompt = `
      Analyze this repository structure and suggest:
      1. Project type and framework
      2. Build commands
      3. Start commands
      4. Required ports
      5. Environment variables

      Files:
      ${files.map(f => f.path).join('\n')}

      Key files content:
      ${files.slice(0, 5).map(f => `${f.path}:\n${f.content}`).join('\n\n')}
    `;

    const response = await ai.complete(prompt);
    return this.parseAIResponse(response);
  }
}
```

## Configuration Validation

### Schema Validation

```typescript
import { z } from 'zod';

const PodSpecSchema = z.object({
  version: z.literal("1.0"),
  metadata: z.object({
    name: z.string().min(1).max(50),
    description: z.string().optional(),
    template: z.string().optional(),
    tier: z.enum(["dev.small", "dev.medium", "dev.large", "dev.xlarge"])
  }),
  runtime: z.object({
    base: z.string(),
    project: z.object({
      repository: z.string().optional(),
      branch: z.string().default("main"),
      build: z.object({
        packageManager: z.enum(["npm", "yarn", "pnpm", "bun"]).optional(),
        install: z.string().optional(),
        build: z.string().optional()
      }).optional(),
      start: z.object({
        dev: z.object({
          command: z.string(),
          port: z.number()
        }),
        prod: z.object({
          command: z.string(),
          port: z.number()
        }).optional()
      })
    })
  }),
  // ... rest of schema
});
```

### Validation Rules

1. **Port Conflicts**: No duplicate internal ports
2. **Resource Limits**: Within tier boundaries
3. **Required Variables**: All required env vars defined
4. **Service Dependencies**: Required services configured
5. **Security Constraints**: No privileged operations

## Configuration Storage

### Repository Storage
- Primary location: `pinacle.yaml` in repo root
- Alternative: `.pinacle/config.yaml`
- Override: `pinacle.{env}.yaml` for environments

### Database Storage
- Cached configuration for performance
- Version history for rollback
- Team-shared configurations

### Encryption
- Secrets encrypted at rest
- AES-256-GCM encryption
- Key rotation every 90 days

## Configuration API

### REST Endpoints

```typescript
// Get configuration
GET /api/pods/{podId}/config

// Update configuration
PUT /api/pods/{podId}/config
{
  "config": { /* YAML as JSON */ }
}

// Validate configuration
POST /api/config/validate
{
  "config": { /* YAML as JSON */ }
}

// Get template
GET /api/templates/{templateId}

// Detect project type
POST /api/config/detect
{
  "repository": "github.com/user/repo"
}
```

### Configuration Hot Reload

```typescript
interface ConfigWatcher {
  watch(podId: string): void;
  onConfigChange(callback: (spec: PodSpec) => void): void;
}

class GitConfigWatcher implements ConfigWatcher {
  async watch(podId: string) {
    // Watch for commits to pinacle.yaml
    const webhook = await github.createWebhook({
      events: ['push'],
      config: {
        url: `https://api.pinacle.dev/webhooks/github`,
        content_type: 'json'
      }
    });

    // Store webhook ID for cleanup
    await db.podWebhooks.create({
      podId,
      webhookId: webhook.id
    });
  }
}
```
