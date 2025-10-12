# Env Sets (Environment Variable Management)

## Overview

Env Sets are reusable collections of environment variables that can be attached to pods. This enables users to manage environment variables separately from pod configuration and reuse them across multiple pods.

**Implementation:**
- `src/lib/db/schema.ts` - `env_sets` table
- `src/lib/trpc/routers/env-sets.ts` - API endpoints
- `src/lib/trpc/routers/pods.ts` - Integration with pod creation

## Why Env Sets?

**Problems solved:**
1. **Reusability** - Define env vars once, use in multiple pods
2. **Separation** - Keep secrets separate from version-controlled config
3. **Organization** - Group related env vars together (e.g., "Production API Keys", "Local Development")
4. **Team Sharing** - Teams can share common env sets

## Architecture

### Database Schema

**Table:** `env_sets`

| Column | Type | Description |
|--------|------|-------------|
| `id` | text | KSUID primary key |
| `name` | varchar(255) | User-friendly name (e.g., "Production Keys") |
| `description` | text | Optional description |
| `ownerId` | text | User who created it |
| `teamId` | text | Team it belongs to |
| `variables` | text | JSON string of key-value pairs |
| `createdAt` | timestamp | Creation timestamp |
| `updatedAt` | timestamp | Last update timestamp |

**Pod Reference:**
- `pods.envSetId` - Foreign key to `env_sets.id` (nullable)
- One env set per pod
- Pod can have no env set (if no environment variables needed)

### Data Flow

```
1. User creates pod with env vars
   ↓
2. Backend creates env set automatically
   - Name: `{pod-name}-env`
   - Variables: JSON.stringify(envVars)
   ↓
3. Pod created with `envSetId` reference
   ↓
4. During provisioning:
   - Load env set from database
   - Parse variables JSON
   - Pass to container as environment
```

## API Endpoints

**File:** `src/lib/trpc/routers/env-sets.ts`

### `envSets.create`

**Auth:** Requires team membership

**Input:**
```typescript
{
  name: string              // "Production API Keys"
  description?: string      // Optional description
  teamId: string            // Team ID
  variables: Record<string, string>  // { API_KEY: "..." }
}
```

**Returns:** Created env set

**Usage:** Create a new reusable env set

### `envSets.list`

**Auth:** Requires team membership

**Input:**
```typescript
{
  teamId: string  // Team ID
}
```

**Returns:** Array of team's env sets

**Usage:** List all env sets for a team

### `envSets.getById`

**Auth:** Requires team membership

**Input:**
```typescript
{
  id: string  // Env set ID
}
```

**Returns:** Single env set

**Usage:** Get details of specific env set

### `envSets.update`

**Auth:** Requires team membership

**Input:**
```typescript
{
  id: string
  name?: string
  description?: string
  variables?: Record<string, string>
}
```

**Returns:** Updated env set

**Usage:** Update env set properties

### `envSets.delete`

**Auth:** Requires ownership

**Input:**
```typescript
{
  id: string
}
```

**Returns:** Success confirmation

**Usage:** Delete env set (must be owner)

## Pod Integration

**File:** `src/lib/trpc/routers/pods.ts`

### Automatic Env Set Creation

During pod creation (`pods.create`), if environment variables are provided:

1. Create env set with generated name
2. Store variables as JSON
3. Link pod to env set via `envSetId`

**Code:**
```typescript
// Create env set if there are environment variables
let envSetId: string | undefined;
if (envVars && Object.keys(envVars).length > 0) {
  const [envSet] = await db
    .insert(envSets)
    .values({
      id: generateKSUID("env_set"),
      name: `${name}-env`,
      description: `Environment variables for ${name}`,
      ownerId: userId,
      teamId,
      variables: JSON.stringify(envVars),
    })
    .returning();
  envSetId = envSet.id;
}

// Create pod with env set reference
const [pod] = await db
  .insert(pods)
  .values({
    // ... other fields
    envSetId, // Attach env set if created
  })
  .returning();
```

### Pod Provisioning

**File:** `src/lib/pod-orchestration/pod-provisioning-service.ts`

During provisioning, env vars are loaded from the env set:

```typescript
// Load environment variables from env set if attached
let environment: Record<string, string> = {};
if (podRecord.envSetId) {
  const [envSet] = await db
    .select()
    .from(envSets)
    .where(eq(envSets.id, podRecord.envSetId))
    .limit(1);

  if (envSet) {
    environment = JSON.parse(envSet.variables);
    console.log(
      `Loaded ${Object.keys(environment).length} env vars from env set: ${envSet.name}`,
    );
  }
}

// Pass environment to config resolver
const config = await this.configResolver.loadConfig(template, {
  // ... other config
  environment,
});
```

## Current Implementation

### Phase 1 (Current)

**What's implemented:**
- ✅ Env sets database schema
- ✅ CRUD API endpoints
- ✅ Automatic creation during pod setup
- ✅ Loading during pod provisioning
- ✅ Integration tests

**Workflow:**
1. User fills setup form with env vars
2. Backend automatically creates env set
3. Pod references env set
4. Provisioning loads env vars from env set

### Phase 2 (Future)

**What's NOT yet implemented:**

1. **UI for env set management**
   - View all env sets
   - Create/edit env sets manually
   - Select existing env set during pod creation

2. **Env set reuse**
   - Attach existing env set to new pod
   - Switch env set on running pod
   - Share env sets across team

3. **Multiple env sets per pod** (Maybe)
   - Compose env vars from multiple sets
   - Define merge order/priority

4. **Environment profiles** (original naming idea)
   - Different env sets for different environments (dev/staging/prod)
   - Quick switching between profiles

## Security

**Environment variables storage:**
- Stored as JSON string in database
- **Not encrypted** (currently)
- Access controlled via team membership

**Future security improvements:**
- Encrypt variables at rest
- Separate "secrets" from regular env vars
- Audit log for env set access
- Rotation policies for sensitive values

## Best Practices

**Naming conventions:**
- Use descriptive names: "Production API Keys", "Local Development"
- Avoid pod-specific names if intending to reuse

**Organization:**
- Group related variables together
- Separate sensitive from non-sensitive
- Document purpose in description field

**Team usage:**
- Create shared env sets for common configs
- Personal env sets for development
- Document variable requirements in team wiki

## Testing

**File:** `src/lib/pod-orchestration/__tests__/integration.test.ts`

Integration tests verify:
- ✅ Env set created automatically during pod creation
- ✅ Env vars loaded from env set during provisioning
- ✅ Env vars injected into container correctly
- ✅ Multiple pods can have separate env sets

**Test example:**
```typescript
// Create env set
const [envSet] = await db
  .insert(envSets)
  .values({
    id: generateKSUID("env_set"),
    name: "Test Env",
    ownerId: testUserId,
    teamId: testTeamId,
    variables: JSON.stringify({ TEST_VAR: "integration-test" }),
  })
  .returning();

// Create pod with env set
const [pod] = await db
  .insert(pods)
  .values({
    // ... other fields
    envSetId: envSet.id,
  })
  .returning();

// Provision pod
await provisioningService.provisionPod({ podId: pod.id });

// Verify env var in container
const result = await podManager.execInPod(pod.id, ["printenv", "TEST_VAR"]);
expect(result.stdout.trim()).toBe("integration-test");
```

## Related Documentation

- [pod-config-representations.md](./pod-config-representations.md) - Configuration architecture
- [02-pod-configuration.md](./02-pod-configuration.md) - Pod configuration details
- `src/lib/db/schema.ts` - Database schema
- `src/lib/trpc/routers/env-sets.ts` - API implementation

