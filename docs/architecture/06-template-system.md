# Template System and Project Detection

## Overview

The template system provides pre-configured development environments for various frameworks and languages, while the project detection system automatically identifies project types and suggests optimal configurations. Templates are stored as code in the repository for version control and easy updates.

## Template Architecture

```mermaid
graph TB
    subgraph "Template Sources"
        Builtin[Built-in Templates]
        Community[Community Templates]
        Custom[Custom Templates]
    end

    subgraph "Template Engine"
        Parser[Template Parser]
        Validator[Template Validator]
        Resolver[Variable Resolver]
        Merger[Config Merger]
    end

    subgraph "Detection System"
        Scanner[File Scanner]
        Analyzer[Pattern Analyzer]
        AI[AI Detector]
        Scorer[Confidence Scorer]
    end

    subgraph "Output"
        Config[Pod Configuration]
        Scripts[Setup Scripts]
        Services[Service Configs]
    end

    Builtin --> Parser
    Community --> Parser
    Custom --> Parser

    Parser --> Validator
    Validator --> Resolver
    Resolver --> Merger

    Scanner --> Analyzer
    Analyzer --> AI
    AI --> Scorer
    Scorer --> Merger

    Merger --> Config
    Merger --> Scripts
    Merger --> Services
```

## Template Structure

### Template Directory Layout

```
/templates/
├── base/                      # Base OS images
│   ├── ubuntu-22.04.yaml
│   ├── debian-12.yaml
│   └── alpine-3.18.yaml
├── frameworks/                # Framework templates
│   ├── frontend/
│   │   ├── nextjs.yaml
│   │   ├── vite.yaml
│   │   ├── react.yaml
│   │   ├── vue.yaml
│   │   └── angular.yaml
│   ├── backend/
│   │   ├── express.yaml
│   │   ├── fastify.yaml
│   │   ├── django.yaml
│   │   └── rails.yaml
│   └── fullstack/
│       ├── remix.yaml
│       ├── nuxt.yaml
│       └── sveltekit.yaml
├── languages/                 # Language-specific
│   ├── javascript.yaml
│   ├── typescript.yaml
│   ├── python.yaml
│   ├── ruby.yaml
│   └── go.yaml
├── services/                  # Service templates
│   ├── claude-code.yaml
│   ├── vibe-kanban.yaml
│   ├── code-server.yaml
│   └── jupyter.yaml
├── bundles/                   # Pre-made combinations
│   ├── ai-developer.yaml
│   ├── data-science.yaml
│   └── web-developer.yaml
└── scripts/                   # Setup scripts
    ├── install/
    ├── configure/
    └── start/
```

### Template Schema

```typescript
interface Template {
  // Metadata
  metadata: {
    name: string;
    version: string;
    description: string;
    author: string;
    category: string;
    tags: string[];
    icon: string;
    homepage?: string;
    repository?: string;
  };

  // Base configuration
  base: {
    image: string;              // Base Docker/OCI image
    extends?: string;           // Parent template to extend
  };

  // Resource recommendations
  resources: {
    recommended: {
      tier: string;             // e.g., "dev.medium"
      cpu: number;
      memory: number;
      storage: number;
    };
    minimum: {
      cpu: number;
      memory: number;
      storage: number;
    };
  };

  // Setup configuration
  setup: {
    // Package managers
    packageManagers: {
      preferred: string;        // npm, yarn, pnpm, bun
      install: string;          // Install command template
      lockFile: string;         // Lock file name
    };

    // Dependencies to install
    systemPackages: string[];  // apt/yum packages
    globalPackages: string[];  // npm/pip global packages

    // Setup scripts
    scripts: {
      preInstall?: string;
      install: string;
      postInstall?: string;
      build?: string;
      start: string;
      dev?: string;
      test?: string;
    };
  };

  // Service configurations
  services: {
    [key: string]: {
      enabled: boolean;
      image?: string;
      command?: string;
      port?: number;
      environment?: Record<string, string>;
      volumes?: string[];
      healthCheck?: {
        command: string;
        interval: number;
        timeout: number;
        retries: number;
      };
    };
  };

  // Port configurations
  ports: {
    [key: string]: {
      internal: number;
      protocol: 'tcp' | 'udp';
      expose: boolean;
      public: boolean;
      description: string;
    };
  };

  // Environment variables
  environment: {
    required: Array<{
      name: string;
      description: string;
      type: string;
      default?: string;
      validation?: string;      // Regex pattern
    }>;
    optional: Record<string, string>;
    computed: Record<string, string>; // Template expressions
  };

  // File templates
  files: Array<{
    path: string;
    content: string;            // Can use template variables
    permissions?: string;
  }>;

  // Detection patterns
  detection: {
    files: string[];            // Files that indicate this template
    patterns: Array<{
      file: string;
      contains: string;         // Content pattern
      weight: number;           // Confidence weight
    }>;
  };
}
```

## Built-in Templates

### Next.js Template

```yaml
# /templates/frameworks/frontend/nextjs.yaml
metadata:
  name: "Next.js Development"
  version: "1.0.0"
  description: "Full-stack React framework with SSR/SSG"
  category: "frontend"
  tags: ["react", "typescript", "fullstack", "ssr"]
  icon: "nextjs"

base:
  image: "node:20-slim"

resources:
  recommended:
    tier: "dev.medium"
    cpu: 1
    memory: 2048
    storage: 20
  minimum:
    cpu: 0.5
    memory: 1024
    storage: 10

setup:
  packageManagers:
    preferred: "pnpm"
    install: "pnpm install"
    lockFile: "pnpm-lock.yaml"

  systemPackages:
    - "git"
    - "curl"
    - "build-essential"

  scripts:
    install: |
      # Install pnpm if not present
      if ! command -v pnpm &> /dev/null; then
        npm install -g pnpm
      fi

      # Install dependencies
      pnpm install

    build: "pnpm run build"
    start: "pnpm run dev"
    dev: "pnpm run dev"

services:
  claude-code:
    enabled: true
    command: "claude-code serve --port 9000"
    port: 9000
    environment:
      CLAUDE_WORKSPACE: "/workspace"

  vibe-kanban:
    enabled: true
    port: 3001
    environment:
      VITE_API_URL: "http://localhost:3000"

ports:
  app:
    internal: 3000
    protocol: "tcp"
    expose: true
    public: false
    description: "Next.js application"

  kanban:
    internal: 3001
    protocol: "tcp"
    expose: true
    public: false
    description: "Vibe Kanban"

environment:
  required:
    - name: "ANTHROPIC_API_KEY"
      description: "Claude AI API key"
      type: "string"

  optional:
    NODE_ENV: "development"
    NEXT_TELEMETRY_DISABLED: "1"

  computed:
    NEXT_PUBLIC_APP_URL: "https://${POD_SUBDOMAIN}.pinacle.dev"
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/${POD_NAME}"

files:
  - path: ".env.local"
    content: |
      # Generated by Pinacle
      NODE_ENV=${NODE_ENV}
      NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
      DATABASE_URL=${DATABASE_URL}

detection:
  files:
    - "next.config.js"
    - "next.config.mjs"
    - "next.config.ts"
  patterns:
    - file: "package.json"
      contains: '"next":'
      weight: 10
    - file: "package.json"
      contains: '"react":'
      weight: 5
```

### Template Bundle Example

```yaml
# /templates/bundles/ai-developer.yaml
metadata:
  name: "AI Developer Bundle"
  version: "1.0.0"
  description: "Complete AI-assisted development environment"
  category: "bundle"
  tags: ["ai", "claude", "copilot", "productivity"]
  icon: "robot"

includes:
  - template: "frameworks/frontend/nextjs"
    override:
      services:
        claude-code:
          enabled: true
          model: "claude-3-opus"

  - template: "services/github-copilot"
    config:
      autoSuggest: true

  - template: "services/jupyter"
    config:
      kernels: ["python3", "javascript"]

resources:
  recommended:
    tier: "dev.large"
    cpu: 2
    memory: 4096
    storage: 40

pricing:
  monthly: 64
  hourly: 0.09
  included:
    - "Claude Code Pro"
    - "GitHub Copilot"
    - "4GB RAM"
    - "2 vCPUs"
    - "40GB Storage"
```

## Project Detection System

### File-Based Detection

```typescript
class FileBasedDetector {
  private detectors: Map<string, FileDetector> = new Map([
    ['nextjs', new NextJSDetector()],
    ['vite', new ViteDetector()],
    ['django', new DjangoDetector()],
    ['rails', new RailsDetector()],
    ['wordpress', new WordPressDetector()],
  ]);

  async detectProject(repoPath: string): Promise<DetectionResult[]> {
    const files = await this.scanDirectory(repoPath);
    const results: DetectionResult[] = [];

    for (const [name, detector] of this.detectors) {
      const confidence = await detector.detect(files);
      if (confidence > 0) {
        results.push({
          template: name,
          confidence,
          evidence: detector.getEvidence()
        });
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }
}

class NextJSDetector implements FileDetector {
  private evidence: string[] = [];

  async detect(files: FileInfo[]): Promise<number> {
    let confidence = 0;
    this.evidence = [];

    // Check for Next.js config files
    if (files.find(f => f.name.match(/^next\.config\.(js|mjs|ts)$/))) {
      confidence += 30;
      this.evidence.push('Found next.config file');
    }

    // Check package.json
    const packageJson = files.find(f => f.name === 'package.json');
    if (packageJson) {
      const content = await this.readFile(packageJson.path);
      const pkg = JSON.parse(content);

      if (pkg.dependencies?.next || pkg.devDependencies?.next) {
        confidence += 40;
        this.evidence.push('Next.js in dependencies');
      }

      if (pkg.scripts?.dev?.includes('next dev')) {
        confidence += 20;
        this.evidence.push('Next.js dev script');
      }
    }

    // Check for pages or app directory
    if (files.find(f => f.path.match(/^(pages|app)\//))) {
      confidence += 10;
      this.evidence.push('Found pages/app directory');
    }

    return Math.min(confidence, 100);
  }

  getEvidence(): string[] {
    return this.evidence;
  }
}
```

### AI-Powered Detection

```typescript
class AIProjectAnalyzer {
  private ai: AIService;

  async analyzeProject(repoPath: string): Promise<ProjectAnalysis> {
    // Collect key files
    const files = await this.collectKeyFiles(repoPath);

    // Prepare context for AI
    const context = await this.prepareContext(files);

    // Generate analysis prompt
    const prompt = this.generatePrompt(context);

    // Get AI analysis
    const response = await this.ai.analyze(prompt);

    // Parse and validate response
    return this.parseAnalysis(response);
  }

  private async collectKeyFiles(repoPath: string): Promise<FileContent[]> {
    const keyFiles = [
      'package.json',
      'composer.json',
      'requirements.txt',
      'Gemfile',
      'go.mod',
      'Cargo.toml',
      'pom.xml',
      'build.gradle',
      'Dockerfile',
      'docker-compose.yml',
      '.env.example',
      'README.md'
    ];

    const files: FileContent[] = [];

    for (const file of keyFiles) {
      const path = `${repoPath}/${file}`;
      if (await this.fileExists(path)) {
        const content = await this.readFile(path);
        files.push({ path: file, content });
      }
    }

    return files;
  }

  private generatePrompt(context: ProjectContext): string {
    return `
      Analyze this project and provide configuration recommendations.

      Project files:
      ${context.files.map(f => `${f.path}:\n${f.content.slice(0, 500)}`).join('\n\n')}

      Directory structure:
      ${context.structure}

      Please identify:
      1. Project type and primary framework
      2. Programming language(s)
      3. Package manager
      4. Build commands
      5. Start/dev commands
      6. Required environment variables
      7. Required services (database, cache, etc.)
      8. Exposed ports
      9. Recommended resource tier

      Respond in JSON format:
      {
        "projectType": "...",
        "framework": "...",
        "language": "...",
        "packageManager": "...",
        "commands": {
          "install": "...",
          "build": "...",
          "start": "...",
          "dev": "..."
        },
        "environment": {
          "required": [...],
          "optional": {...}
        },
        "services": [...],
        "ports": [...],
        "resources": {
          "cpu": ...,
          "memory": ...,
          "storage": ...
        },
        "confidence": 0.0-1.0
      }
    `;
  }

  private parseAnalysis(response: string): ProjectAnalysis {
    try {
      const analysis = JSON.parse(response);

      // Validate and sanitize
      return {
        projectType: analysis.projectType || 'unknown',
        framework: analysis.framework || 'none',
        language: analysis.language || 'javascript',
        packageManager: analysis.packageManager || 'npm',
        commands: {
          install: analysis.commands?.install || 'npm install',
          build: analysis.commands?.build,
          start: analysis.commands?.start || 'npm start',
          dev: analysis.commands?.dev || 'npm run dev'
        },
        environment: {
          required: analysis.environment?.required || [],
          optional: analysis.environment?.optional || {}
        },
        services: analysis.services || [],
        ports: analysis.ports || [3000],
        resources: {
          cpu: analysis.resources?.cpu || 1,
          memory: analysis.resources?.memory || 2048,
          storage: analysis.resources?.storage || 20
        },
        confidence: analysis.confidence || 0.5
      };
    } catch (error) {
      console.error('Failed to parse AI analysis:', error);
      return this.getDefaultAnalysis();
    }
  }
}
```

## Template Composition

### Template Merger

```typescript
class TemplateMerger {
  async mergeTemplates(
    base: Template,
    overrides: Partial<Template>,
    userConfig?: Partial<Template>
  ): Promise<Template> {
    // Start with base template
    let merged = { ...base };

    // Apply template overrides
    merged = this.deepMerge(merged, overrides);

    // Apply user configuration
    if (userConfig) {
      merged = this.deepMerge(merged, userConfig);
    }

    // Resolve variables
    merged = await this.resolveVariables(merged);

    // Validate final configuration
    await this.validate(merged);

    return merged;
  }

  private deepMerge(target: any, source: any): any {
    const output = { ...target };

    if (isObject(target) && isObject(source)) {
      Object.keys(source).forEach(key => {
        if (isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else if (Array.isArray(source[key])) {
          // Special handling for arrays
          if (key === 'systemPackages' || key === 'globalPackages') {
            // Concatenate package lists
            output[key] = [...(target[key] || []), ...source[key]];
          } else {
            // Replace arrays by default
            output[key] = source[key];
          }
        } else {
          output[key] = source[key];
        }
      });
    }

    return output;
  }

  private async resolveVariables(template: Template): Promise<Template> {
    const context = {
      POD_NAME: process.env.POD_NAME,
      POD_ID: process.env.POD_ID,
      POD_SUBDOMAIN: process.env.POD_SUBDOMAIN,
      USER_NAME: process.env.USER_NAME,
      TEAM_NAME: process.env.TEAM_NAME,
      ...template.environment?.computed
    };

    // Recursively resolve template strings
    return this.resolveTemplateStrings(template, context);
  }
}
```

## Template Marketplace

### Community Templates

```typescript
interface CommunityTemplate {
  id: string;
  name: string;
  description: string;
  author: {
    id: string;
    name: string;
    avatar: string;
    verified: boolean;
  };
  repository: string;
  stars: number;
  downloads: number;
  version: string;
  compatibility: string[];
  pricing: {
    type: 'free' | 'paid' | 'freemium';
    price?: number;
    features?: string[];
  };
  reviews: {
    rating: number;
    count: number;
  };
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

class TemplateMarketplace {
  async searchTemplates(query: string, filters?: TemplateFilters): Promise<CommunityTemplate[]> {
    const templates = await db.communityTemplates.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { tags: { hasSome: [query] } }
        ],
        ...(filters?.category && { category: filters.category }),
        ...(filters?.pricing && { 'pricing.type': filters.pricing }),
        ...(filters?.minRating && { 'reviews.rating': { gte: filters.minRating } })
      },
      orderBy: filters?.sortBy || { downloads: 'desc' },
      take: filters?.limit || 20
    });

    return templates;
  }

  async installTemplate(templateId: string, userId: string): Promise<void> {
    const template = await this.getTemplate(templateId);

    // Check permissions
    if (template.pricing.type === 'paid') {
      await this.verifyPurchase(userId, templateId);
    }

    // Download template
    const content = await this.downloadTemplate(template.repository);

    // Install to user's templates
    await db.userTemplates.create({
      data: {
        userId,
        templateId,
        content,
        installedAt: new Date()
      }
    });

    // Increment download count
    await db.communityTemplates.update({
      where: { id: templateId },
      data: { downloads: { increment: 1 } }
    });
  }
}
```
