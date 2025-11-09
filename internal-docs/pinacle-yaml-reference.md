# pinacle.yaml Reference

The `pinacle.yaml` file is the configuration file for your Pinacle pod. It defines which services run in your development environment and how resources are allocated.

## Overview

When you create a pod on Pinacle, a `pinacle.yaml` file is automatically generated in your repository's root directory. This file serves as the source of truth for your pod configuration and allows you to:

- **Version control your dev environment** - Commit it to your repository
- **Share configuration with your team** - Everyone gets the same setup
- **Quickly recreate pods** - Pinacle detects this file and pre-populates settings
- **Customize services** - Choose which tools and AI assistants you want

## File Location

The `pinacle.yaml` file must be placed in the root of your repository:

```
your-repository/
├── pinacle.yaml          ← Configuration file
├── src/
├── package.json
└── README.md
```

## Configuration Schema

### Basic Example

```yaml
# Pinacle Pod Configuration
# https://pinacle.dev/docs/configuration

version: "1.0"

# Resource tier
# Options: dev.small, dev.medium, dev.large, dev.xlarge
tier: dev.small

# Services to run in your pod
# Available services: claude-code, openai-codex, cursor-cli,
# gemini-cli, vibe-kanban, code-server, web-terminal
services:
  - claude-code
  - vibe-kanban
  - code-server
```

### Full Example

```yaml
# Pinacle Pod Configuration
version: "1.0"

# Pod name (defaults to repository name if not specified)
name: "my-awesome-project"

# Template ID (for UI reference)
template: "nextjs"

# Resource tier
tier: dev.medium

# Services to run in your pod
services:
  - openai-codex      # OpenAI-powered coding assistant
  - vibe-kanban       # Kanban board for project management
  - code-server       # VS Code in the browser
  - web-terminal      # Web-based terminal access

# Install command (runs once during provisioning)
install: pnpm install

# Your application processes
processes:
  - name: app
    displayName: App
    startCommand: pnpm dev
    url: http://localhost:3000
    healthCheck: curl -f http://localhost:3000
```

## Configuration Fields

### `version` (required)

- **Type**: `string`
- **Default**: `"1.0"`
- **Description**: Schema version for future compatibility.

```yaml
version: "1.0"
```

### `name` (optional)

- **Type**: `string`
- **Description**: Display name for your pod. If not specified, defaults to your repository name.

```yaml
name: "my-project"
```

### `template` (optional)

- **Type**: `string`
- **Description**: Template ID for UI reference. This helps the Pinacle UI show relevant information but doesn't affect pod provisioning directly.
- **Available templates**: `nextjs`, `vite`, `langflow`, `agno`, `mastra`, `nodejs-blank`, `python-blank`

```yaml
template: "nextjs"
```

### `tier` (required)

- **Type**: `string`
- **Default**: `"dev.small"`
- **Description**: Resource tier that determines CPU, memory, and storage allocation.
- **Options**:
  - `dev.small`: 1 vCPU, 1GB RAM, 10GB storage ($6/month)
  - `dev.medium`: 2 vCPU, 2GB RAM, 20GB storage ($12/month)
  - `dev.large`: 4 vCPU, 4GB RAM, 40GB storage ($24/month)
  - `dev.xlarge`: 8 vCPU, 8GB RAM, 80GB storage ($48/month)

```yaml
tier: dev.medium
```

### `services` (required)

- **Type**: `array of strings`
- **Default**: `["claude-code", "vibe-kanban", "code-server"]`
- **Description**: List of service names to enable in your pod.

```yaml
services:
  - claude-code
  - vibe-kanban
  - code-server
```

### `install` (optional)

- **Type**: `string` or `array of strings`
- **Description**: Command(s) to run during pod provisioning to install dependencies. Runs once before starting processes.

**Simple string:**
```yaml
install: pnpm install
```

**Multiline for complex installs:**
```yaml
install: |
  apt-get update
  apt-get install -y libpq-dev
  pnpm install
```

**Array of commands:**
```yaml
install:
  - pnpm install
  - pnpm build:deps
```

### `processes` (optional)

- **Type**: `array of objects`
- **Default**: `[]` (template defaults are used if not specified)
- **Description**: Your application processes (frontend, backend, workers, etc.). Each process runs in a tmux session and creates dashboard tabs.

**Fields:**
- `name` (required): Unique identifier for the process
- `displayName` (optional): Display name in UI tabs (auto-generated from name if not provided)
- `startCommand` (required): Command(s) to start the process
- `url` (optional): If provided, creates a browser preview tab in dashboard
- `healthCheck` (optional): Command to verify the process is healthy (for new repositories only)

**Single process example:**
```yaml
processes:
  - name: app
    displayName: App
    startCommand: pnpm dev
    url: http://localhost:3000
    healthCheck: curl -f http://localhost:3000
```

**Multiple processes example (monorepo/microservices):**
```yaml
processes:
  - name: frontend
    displayName: Frontend
    startCommand: pnpm dev:frontend
    url: http://localhost:3000

  - name: backend
    displayName: API
    startCommand: pnpm dev:backend
    url: http://localhost:8000
    healthCheck: curl -f http://localhost:8000/health

  - name: workers
    displayName: Workers
    startCommand: pnpm dev:workers
    # No URL - just logs in terminal
```

**Multiline commands:**
```yaml
processes:
  - name: app
    startCommand: |
      cd frontend
      pnpm dev
    url: http://localhost:3000
```

## Available Services

### AI Coding Assistants

**Note**: You can only run one coding assistant at a time. Choose one from the list below:

#### `claude-code`
- **Name**: Claude Code
- **Description**: Anthropic's Claude AI coding assistant via terminal
- **Requires**: `ANTHROPIC_API_KEY` environment variable
- **Port**: 2528

#### `openai-codex`
- **Name**: OpenAI Codex
- **Description**: OpenAI-powered coding assistant
- **Requires**: `OPENAI_API_KEY` environment variable
- **Port**: 2528

#### `cursor-cli`
- **Name**: Cursor CLI
- **Description**: Cursor AI coding assistant
- **Port**: 2528

#### `gemini-cli`
- **Name**: Gemini CLI
- **Description**: Google Gemini coding assistant
- **Requires**: `GEMINI_API_KEY` environment variable
- **Port**: 2528

### Development Tools

#### `vibe-kanban`
- **Name**: Vibe Kanban
- **Description**: Lightweight kanban board for project management
- **Port**: 5262

#### `code-server`
- **Name**: VS Code
- **Description**: VS Code running in your browser
- **Port**: 8726

#### `web-terminal`
- **Name**: Terminal
- **Description**: Web-based terminal access to your pod
- **Port**: 7681
- **Note**: This service is included by default and hidden from the UI

## Environment Variables

**Important**: Do NOT include sensitive data like API keys in `pinacle.yaml`. This file is meant to be committed to version control.

Environment variables are configured separately through the Pinacle dashboard or during pod creation. Required environment variables depend on which services you enable:

- **Claude Code** requires: `ANTHROPIC_API_KEY`
- **OpenAI Codex** requires: `OPENAI_API_KEY`
- **Gemini CLI** requires: `GEMINI_API_KEY`
- **Template-specific** variables (e.g., `NEXTAUTH_SECRET`, `DATABASE_URL` for Next.js projects)

## How pinacle.yaml is Used

1. **Pod Creation**: When you create a new pod without an existing `pinacle.yaml`, Pinacle generates one based on your selections.

2. **File Injection**: The generated `pinacle.yaml` is written to your pod's `/workspace` directory.

3. **Version Control**: You can commit this file to your repository for team sharing and consistency.

4. **Automatic Detection**: When opening an existing repository, Pinacle automatically detects `pinacle.yaml` and pre-fills the configuration form.

5. **Updates**: When you modify services through the Pinacle UI, the `pinacle.yaml` in your pod is updated. You can then commit these changes.

## Best Practices

1. **Commit the file**: Always commit `pinacle.yaml` to your repository so your team has the same configuration.

2. **Keep it simple**: The file is intentionally minimal. Complex configuration is handled by Pinacle's service registry.

3. **Document custom choices**: If you deviate from defaults, add comments explaining why:
   ```yaml
   services:
     - openai-codex    # Using OpenAI instead of Claude for better Python support
     - code-server
   ```

4. **Review before committing**: Make sure you're not accidentally committing environment variables or secrets.

## Troubleshooting

### File Not Detected

If Pinacle doesn't detect your `pinacle.yaml`:
- Ensure it's in the repository root (not in a subdirectory)
- Check the file is named exactly `pinacle.yaml` (lowercase, with extension)
- Verify the YAML syntax is valid

### Invalid Configuration

If you see validation errors:
- Check that `version` is set to `"1.0"`
- Ensure `tier` is one of the valid options
- Verify service names match the available services exactly
- Make sure the YAML syntax is correct (proper indentation, spacing)

### Services Not Starting

If services don't start even with a valid configuration:
- Check that required environment variables are provided (e.g., API keys for AI assistants)
- Review pod logs in the Pinacle dashboard
- Verify you're not running multiple coding assistants simultaneously

## Examples

### Minimal Next.js Setup

```yaml
version: "1.0"
template: "nextjs"
tier: dev.small
services:
  - claude-code
  - code-server
```

### Python Data Science Setup

```yaml
version: "1.0"
template: "python-blank"
tier: dev.large
services:
  - gemini-cli
  - vibe-kanban
  - code-server
```

### Team Collaboration Setup

```yaml
version: "1.0"
name: "team-project"
tier: dev.medium
services:
  - cursor-cli
  - vibe-kanban
  - code-server
  - web-terminal
```

### Langflow AI Development

```yaml
version: "1.0"
template: "langflow"
tier: dev.xlarge
services:
  - claude-code
  - code-server
```

## Migration Guide

If you have an existing pod without `pinacle.yaml`:

1. Pinacle will automatically generate one based on your current configuration
2. The file will appear in your pod's `/workspace` directory
3. Review and commit it to your repository
4. Future pod creations will use this configuration by default

## Support

For questions or issues with `pinacle.yaml`:
- Documentation: https://pinacle.dev/docs
- Support: support@pinacle.dev
- Community: https://github.com/pinacle-dev/pinacle/discussions

