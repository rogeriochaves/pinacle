# Pod Configuration Representations

Pinacle uses three distinct representations for pod configuration, each serving a different purpose in the system architecture.

## Overview

```
┌─────────────────┐      ┌──────────────┐      ┌─────────────────┐
│  PinacleConfig  │──────▶│   Database   │──────▶│    PodSpec      │
│   (YAML File)   │      │    Schema    │      │  (Runtime Spec) │
└─────────────────┘      └──────────────┘      └─────────────────┘
  User-facing              Persistent            Orchestration
  Version control          Normalized            In-memory only
```

---

## 1. PinacleConfig (YAML File)

**File:** `src/lib/pod-orchestration/pinacle-config.ts`

**Purpose:** User-facing, version-controlled configuration file.

**Contains:**
- `version` - Schema version (currently "1.0")
- `name` - Pod display name (optional)
- `template` - Base template ID (optional, e.g., "nextjs", "vite")
- `tier` - Resource tier (e.g., "dev.small", "dev.medium")
- `services` - Array of service names (e.g., ["claude-code", "vibe-kanban"])
- `tabs` - UI tabs configuration (optional, auto-generated if not specified)

**Excludes:**
- Environment variables (stored separately in DB)
- Secrets (never committed to version control)
- Runtime state (container IDs, ports, IPs)
- Low-level orchestration details

**Storage:**
- Committed to user's git repository as `pinacle.yaml`
- Stored in database as JSON in `pods.config` column
- Auto-generated on pod creation, user can modify

**Example:**
```yaml
version: "1.0"
name: "My Next.js App"
template: "nextjs"
tier: "dev.medium"
services:
  - claude-code
  - vibe-kanban
  - code-server
tabs:
  - name: "App"
    url: "http://localhost:3000"
  - name: "VS Code"
    url: "http://localhost:8726"
```

**Key Functions:**
- `parsePinacleConfig()` - Parse YAML string to validated PinacleConfig
- `serializePinacleConfig()` - Convert PinacleConfig to YAML with comments
- `generatePinacleConfigFromForm()` - Create from setup form data
- `podRecordToPinacleConfig()` - Parse from database JSON

---

## 2. Database Schema (`pods` table)

**File:** `src/lib/db/schema.ts`

**Purpose:** Normalized persistent storage for pods.

**Key Columns:**

### Identity & Metadata
- `id` - Unique pod ID (KSUID)
- `name` - Pod name
- `slug` - URL-friendly slug
- `description` - Optional description
- `teamId` / `ownerId` - Ownership

### Configuration
- **`config`** - JSON string of `PinacleConfig` (required, single source of truth)
  - Contains tier, services, tabs, template
  - Resources derived dynamically from tier at runtime

### Secrets & Environment (Separate from config)
- **`envVars`** - JSON string of environment variables (not committed)
- Future: Will move to separate `environment_profiles` table for reusability

### Runtime State
- `status` - Pod status (creating, running, stopped, error)
- `containerId` - Docker container ID
- `internalIp` - Pod's internal IP address
- `ports` - JSON string of port mappings
- `publicUrl` - External access URL

### GitHub Integration
- `githubRepo` - Repository name (e.g., "user/repo")
- `githubBranch` - Branch name
- `template` - Template ID used

### Billing & Lifecycle
- `monthlyPrice` - Price in cents
- `createdAt`, `lastStartedAt`, `lastStoppedAt`

**Design Principles:**
- **Normalized:** Config stored once, referenced by ID
- **Separated Concerns:** Config vs. runtime state vs. secrets
- **Flexible:** JSON columns for complex types
- **Auditable:** Timestamps for lifecycle events

---

## 3. PodSpec (Runtime Specification)

**File:** `src/lib/pod-orchestration/types.ts`

**Purpose:** Complete in-memory specification for pod orchestration.

**Contains EVERYTHING needed for provisioning:**

### Core Identity
- `id`, `name`, `slug`, `description`

### Template & Base
- `templateId` - Optional template reference
- `baseImage` - Docker image (e.g., "pinacledev/pinacle-base")

### Resources (Explicit Values)
```typescript
resources: {
  tier: "dev.medium",
  cpuCores: 1,           // Explicit value
  memoryMb: 2048,        // Explicit value
  storageMb: 20480,      // Explicit value
}
```

### Network Configuration
```typescript
network: {
  ports: [
    { container: 80, host: 30000, protocol: "tcp" }
  ],
  subnet: "10.249.1.0/24",
  gateway: "10.249.1.1"
}
```

### Services (Full Specifications)
```typescript
services: [
  {
    name: "claude-code",
    port: 2528,
    installScript: "pnpm install -g @anthropic-ai/claude-code",
    startCommand: "ttyd -p 2528 ...",
    healthCheck: { ... }
  }
]
```

### Environment & Secrets
- `environment` - All environment variables (merged)
- `secrets` - Sensitive values (not persisted)

### GitHub Integration
- `githubRepo`, `githubBranch`
- `sshKeyPath`
- `githubRepoSetup` - Full setup configuration

### Runtime Details
- `mounts` - Volume mounts
- Custom resource limits, security options, etc.

**Key Characteristics:**
- **Aggregated:** Everything in one place
- **Explicit:** All values expanded (no tier lookups)
- **Ephemeral:** Lives only during provisioning, not persisted as-is
- **Complete:** No external dependencies needed

**Used By:**
- `PodManager.createPod()` - Main orchestration
- `ContainerRuntime` - Container creation
- `NetworkManager` - Network setup
- `ServiceProvisioner` - Service installation
- `GitHubIntegration` - Repository cloning

---

## Conversion Flow

### User Creates Pod (Setup Form → Pod)

```
1. User fills setup form
   ↓
2. generatePinacleConfigFromForm()
   → Creates PinacleConfig { tier, services, template }
   ↓
3. Store in database as JSON
   → pods.config = pinacleConfigToJSON()
   → pods.envVars = JSON.stringify(envVars)
   ↓
4. PodProvisioningService.provisionPod()
   a. Read pod record from database
   b. podRecordToPinacleConfig(podRecord)
   c. ConfigResolver.loadConfig(template, { ...podRecord, resources: derived })
      → Expands to full PodSpec with all details
   d. PodManager.createPod(podSpec)
      → Provisions container, network, services
   e. Inject pinacle.yaml into /workspace
      → serializePinacleConfig(pinacleConfig)
```

### Existing Pod Startup

```
1. Read pod from database
   ↓
2. Parse pods.config JSON
   → podRecordToPinacleConfig()
   ↓
3. Derive resources from tier
   → getResourcesFromTier(config.tier)
   ↓
4. Build PodSpec
   → ConfigResolver.loadConfig()
   ↓
5. Start pod
   → PodManager.startPod()
```

### Syncing Changes Back

```
1. User modifies pod (changes services, tier)
   ↓
2. Update happens in runtime (PodSpec)
   ↓
3. Convert back to PinacleConfig
   → podSpecToPinacleConfig()
   ↓
4. Update database
   → Update pods.config column
   ↓
5. Re-inject pinacle.yaml
   → serializePinacleConfig()
   → Write to /workspace/pinacle.yaml
```

---

## Key Design Decisions

### Why Three Representations?

1. **Separation of Concerns**
   - Users shouldn't see orchestration complexity
   - Database shouldn't store ephemeral runtime state
   - Orchestration needs everything in one place

2. **Version Control**
   - `PinacleConfig` can be committed safely (no secrets)
   - Enables infrastructure-as-code workflow

3. **Flexibility**
   - Can change internal orchestration without breaking user configs
   - Can normalize database without affecting YAML format

4. **Performance**
   - PodSpec has everything pre-expanded (no joins/lookups during provisioning)
   - Database can be normalized for efficient queries

### Why Not Just One?

**If we only had PodSpec:**
- ❌ Too complex for users
- ❌ Contains secrets (can't commit)
- ❌ Requires database schema changes for every orchestration change

**If we only had PinacleConfig:**
- ❌ Missing runtime state
- ❌ Missing ephemeral secrets
- ❌ Need to re-derive everything on every operation

**If we only had database schema:**
- ❌ Not version-controllable
- ❌ Can't share configs easily
- ❌ Couples user experience to database design

---

## File References

**Configuration Types:**
- `src/lib/pod-orchestration/pinacle-config.ts` - PinacleConfig type, parsing, serialization
- `src/lib/pod-orchestration/types.ts` - PodSpec type definition
- `src/lib/db/schema.ts` - Database schema (pods table)

**Conversion Functions:**
- `src/lib/pod-orchestration/pinacle-config.ts` - All PinacleConfig helpers
- `src/lib/pod-orchestration/config-resolver.ts` - PinacleConfig → PodSpec

**Usage:**
- `src/lib/pod-orchestration/pod-provisioning-service.ts` - Orchestrates conversions
- `src/lib/trpc/routers/pods.ts` - API layer (form → PinacleConfig → DB)
- `src/lib/pod-orchestration/pod-manager.ts` - Uses PodSpec for operations

