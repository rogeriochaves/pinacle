# Pod Configuration System

##Overview

The pod configuration system uses three distinct representations (see [pod-config-representations.md](./pod-config-representations.md) for detailed comparison):

1. **PinacleConfig** - User-facing YAML file (`pinacle.yaml`) stored in repositories
2. **Database Schema** - Normalized storage in `pods` table
3. **PodSpec** - Runtime specification used during orchestration

This architecture enables version control, portability, and infrastructure-as-code practices while maintaining separation of concerns.

## PinacleConfig (pinacle.yaml)

**Implementation:** `src/lib/pod-orchestration/pinacle-config.ts`
**Public docs:** `docs/pinacle-yaml.mdx`

The `pinacle.yaml` file is a **simplified, user-editable** configuration that defines:
- Resource tier (e.g., "dev.small", "dev.medium")
- Services to include (e.g., claude-code, vibe-kanban)
- Optional name, template, and UI tabs

**Key design principle:** Excludes secrets, environment variables, and runtime state - only version-controllable configuration.

### Schema (v1.0)

```yaml
version: "1.0"
name: "My App"                    # Optional
template: "nextjs"                # Optional base template
tier: "dev.medium"                # Required: dev.small|dev.medium|dev.large|dev.xlarge
services:                         # Optional, defaults based on template
  - claude-code
  - vibe-kanban
  - code-server
tabs:                             # Optional, auto-generated if not specified
  - name: "App"
    url: "http://localhost:3000"
  - name: "VS Code"
    url: "http://localhost:8726"
```

## Configuration Flow

### Pod Creation

**Implementation:** `src/lib/trpc/routers/pods.ts` (create mutation)

1. User submits setup form
2. Form data → `PinacleConfig` via `generatePinacleConfigFromForm()`
3. Store in database:
   - `pods.config` = JSON of `PinacleConfig`
   - `pods.envVars` = JSON of environment variables (separate)
4. Trigger provisioning job

### Pod Provisioning

**Implementation:** `src/lib/pod-orchestration/pod-provisioning-service.ts`

1. Read pod record from database
2. Parse `PinacleConfig` via `podRecordToPinacleConfig()`
3. Expand to full `PodSpec`:
   - Derive resources from tier via `getResourcesFromTier()`
   - Expand services via `ConfigResolver.loadConfig()`
   - Merge environment variables
4. Provision pod via `PodManager.createPod()`
5. Inject `pinacle.yaml` into `/workspace` via `serializePinacleConfig()`

### Template System

**Implementation:** `src/lib/pod-orchestration/template-registry.ts`

Templates provide base configurations for common stacks:
- Base images (e.g., `pinacledev/pinacle-base`)
- Default services (e.g., Next.js includes claude-code, vibe-kanban, code-server)
- Environment variable defaults with generators
- Technology stack indicators

Available templates:
- `nextjs` - Next.js applications
- `vite` - Vite/React applications
- `langflow` - Langflow AI applications
- `nodejs-blank` - Blank Node.js environment
- `python-blank` - Blank Python environment

### Service Registry

**Implementation:** `src/lib/pod-orchestration/service-registry.ts`

Services are modular components that can be added to pods:

**AI Coding Assistants:**
- `claude-code` - Anthropic Claude
- `openai-codex` - OpenAI Codex
- `cursor-cli` - Cursor CLI
- `gemini-cli` - Google Gemini

**Development Tools:**
- `code-server` - VS Code in browser
- `vibe-kanban` - Project management
- `web-terminal` - Web-based terminal

**Databases:**
- `postgres` - PostgreSQL
- `redis` - Redis

**Other:**
- `jupyter` - Jupyter notebooks

Each service defines:
- Display name and icon
- Default port
- Install script
- Start command (OpenRC service)
- Health check configuration

### Resource Tiers

**Implementation:** `src/lib/pod-orchestration/resource-tier-registry.ts`

Tiers abstract away CPU/memory/storage allocation:

| Tier | CPU | Memory | Storage | Price |
|------|-----|--------|---------|-------|
| dev.small | 0.5 | 1GB | 10GB | $10/mo |
| dev.medium | 1 | 2GB | 20GB | $20/mo |
| dev.large | 2 | 4GB | 40GB | $40/mo |
| dev.xlarge | 4 | 8GB | 80GB | $80/mo |

Resources are derived at runtime via `getResourcesFromTier(tierId)`.

## Environment Variables

**Current implementation:** Stored in `pods.envVars` as JSON
**Future:** Will move to separate `environment_profiles` table for reusability

Environment variables are:
- **Not** stored in `pinacle.yaml` (to avoid committing secrets)
- Managed separately in the database
- Can have template-defined defaults (e.g., `DATABASE_URL`)
- Can be auto-generated (e.g., `NEXTAUTH_SECRET` via `openssl rand -hex 32`)

**Implementation:** `src/lib/pod-orchestration/template-registry.ts` (envVarDefaults)

## Configuration Validation

**Implementation:** `src/lib/pod-orchestration/pinacle-config.ts`

All `PinacleConfig` objects are validated via Zod schema:
- `version` must be "1.0" (or numeric 1.0)
- `tier` must be valid tier ID from registry
- `services` must be valid service names from registry
- `tabs` must have name and url fields

Invalid configs throw descriptive errors during:
- Parsing YAML via `parsePinacleConfig()`
- Form submission via `generatePinacleConfigFromForm()`
- Database reads via `podRecordToPinacleConfig()`

## File Injection

**Implementation:** `src/lib/pod-orchestration/github-integration.ts`

On pod creation, the `pinacle.yaml` file is:
1. Generated from `PinacleConfig`
2. Serialized with helpful comments via `serializePinacleConfig()`
3. Injected into `/workspace/pinacle.yaml` in the container
4. User can commit it to their repository

This enables:
- Version control of pod configuration
- Sharing configurations across team
- Infrastructure-as-code workflows
- Easy pod recreation from existing repos

## Future Enhancements

**Planned improvements:**

1. **Environment Profiles** (Task #19)
   - Separate `environment_profiles` table
   - Reusable env var groups across pods
   - Attach/detach profiles as needed

2. **Reading pinacle.yaml from existing repos**
   - Detect existing `pinacle.yaml` during setup
   - Pre-populate form with values
   - Skip template selection if config exists

3. **Live sync of changes**
   - Watch for changes to running pod
   - Update `pinacle.yaml` automatically
   - Sync back to repository

## Related Documentation

- [pod-config-representations.md](./pod-config-representations.md) - Detailed comparison of three representations
- [03-pod-lifecycle.md](./03-pod-lifecycle.md) - Pod provisioning and lifecycle
- [06-template-system.md](./06-template-system.md) - Template architecture
- `docs/pinacle-yaml.mdx` - Public user documentation
