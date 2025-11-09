# Template System

## Overview

Templates provide pre-configured base setups for common technology stacks, simplifying pod creation and ensuring best practices.

**Implementation:** `src/lib/pod-orchestration/template-registry.ts`

## Architecture

### Template Structure

Each template defines:
- **Base configuration**: Docker image, services, default tier
- **Technology stack**: Languages, frameworks, tools for UI display
- **Environment defaults**: Required env vars with static or generated values
- **Services**: AI assistants, dev tools, databases

### Template Registry

**File:** `src/lib/pod-orchestration/template-registry.ts`

Centralized registry of all available templates:

```typescript
export const POD_TEMPLATES: Record<TemplateId, PodTemplate> = {
  "nextjs": { ... },
  "vite": { ... },
  "langflow": { ... },
  "nodejs-blank": { ... },
  "python-blank": { ... },
};
```

## Available Templates

### nextjs - Next.js Application

**Base image:** `pinacledev/pinacle-base` (Node.js + pnpm)

**Services:**
- claude-code (AI assistant)
- vibe-kanban (project management)
- code-server (VS Code)

**Tech stack:** Next.js, React, TypeScript, Tailwind CSS

**Environment defaults:**
- `NEXTAUTH_SECRET` - Generated via `openssl rand -hex 32`
- `DATABASE_URL` - Static: `postgresql://postgres:postgres@localhost:5432/app`

### vite - Vite/React Application

**Base image:** `pinacledev/pinacle-base`

**Services:**
- claude-code
- vibe-kanban
- code-server

**Tech stack:** Vite, React, TypeScript

**Environment defaults:** None (Vite uses `.env` files)

### langflow - Langflow AI Application

**Base image:** `pinacledev/pinacle-base`

**Services:**
- claude-code (Langflow-specific AI assistant)
- code-server (VS Code)

**Tech stack:** Langflow, Python, AI/ML

**Environment defaults:**
- `LANGFLOW_DATABASE_URL` - PostgreSQL connection
- `LANGFLOW_SECRET_KEY` - Generated secret

### nodejs-blank - Blank Node.js Environment

**Base image:** `pinacledev/pinacle-base`

**Services:**
- claude-code
- code-server

**Tech stack:** Node.js, npm/pnpm

**Environment defaults:** None (user configures as needed)

### python-blank - Blank Python Environment

**Base image:** `pinacledev/pinacle-python-base`

**Services:**
- claude-code
- code-server

**Tech stack:** Python, pip

**Environment defaults:** None

## Template Selection

### Setup Form Integration

**Component:** `src/components/setup/template-selector.tsx`

**Filtering logic:**
- **New repository**: Show all templates (user chooses stack)
- **Existing repository**: Show only blank templates (repo has existing code)

**URL parameter:** `?template=nextjs`

### Template Application

**File:** `src/lib/pod-orchestration/config-resolver.ts`

When creating pod:
1. Read template from registry
2. Apply base configuration
3. Merge user customizations
4. Expand to full `PodSpec`

## Environment Variable Defaults

**Implementation:** `src/lib/pod-orchestration/template-registry.ts`

Each template can define environment defaults:

```typescript
type EnvVarDefaults = {
  [key: string]: string | (() => string);
};
```

**Static values:**
```typescript
envVarDefaults: {
  "DATABASE_URL": "postgresql://localhost:5432/app",
}
```

**Generated values:**
```typescript
envVarDefaults: {
  "NEXTAUTH_SECRET": generateRandomSecret,
}
```

**Generator function:**
```typescript
const generateRandomSecret = (): string => {
  // Executes: openssl rand -hex 32
  return crypto.randomBytes(32).toString('hex');
};
```

### UI Integration

**Component:** `src/components/setup/environment-variables.tsx`

- Auto-populated fields marked with hint
- Generated values displayed but editable
- User can override defaults

## Service Configuration

### Default Services

Templates define which services to include:

```typescript
{
  services: ["claude-code", "vibe-kanban", "code-server"]
}
```

### Service Customization

**Component:** `src/components/setup/service-customizer.tsx`

Users can:
- **Switch AI assistant**: claude-code → openai-codex, cursor-cli, gemini-cli
- **Remove tools**: Uncheck vibe-kanban, code-server
- **Add more**: Select from registry (future)

**Form integration:** `customServices` field in React Hook Form

## Template Extensions

### Future Features

**Not yet implemented:**

1. **User-defined templates**
   - Users can create custom templates
   - Share templates with team
   - Community template marketplace

2. **Template inheritance**
   - Extend existing templates
   - Override specific settings
   - Compose multiple templates

3. **Framework detection**
   - Auto-detect framework from repository
   - Suggest appropriate template
   - Apply best practices automatically

4. **Multi-service templates**
   - Templates with databases
   - Templates with Redis, Elasticsearch
   - Full-stack templates (frontend + backend)

## Best Practices

### Creating Templates

**Guidelines for future template additions:**

1. **Base image selection**
   - Use official Pinacle base images
   - Include common tools (git, ssh, curl)
   - Keep images small

2. **Service selection**
   - Include AI assistant (default: claude-code)
   - Include code-server for IDE access
   - Add framework-specific tools

3. **Environment defaults**
   - Provide sensible development defaults
   - Use generators for secrets
   - Document required variables

4. **Documentation**
   - Describe tech stack clearly
   - List included services
   - Provide setup instructions

### Template Naming

**Conventions:**
- Framework templates: `<framework>` (e.g., `nextjs`, `django`)
- Language templates: `<language>-blank` (e.g., `nodejs-blank`, `python-blank`)
- Stack templates: `<stack>` (e.g., `langflow`, `jupyter`)

## Related Documentation

- [pod-config-representations.md](./pod-config-representations.md) - Configuration architecture
- [02-pod-configuration.md](./02-pod-configuration.md) - Configuration details
- `src/lib/pod-orchestration/service-registry.ts` - Service definitions
- `src/lib/pod-orchestration/template-registry.ts` - Template implementations
