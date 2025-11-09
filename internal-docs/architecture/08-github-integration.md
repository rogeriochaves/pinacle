# GitHub Integration

## Overview

GitHub integration enables automatic repository cloning, reading configuration files, and managing pod-repository associations.

**Implementation:**
- `src/lib/pod-orchestration/github-integration.ts` - Git operations
- `src/lib/trpc/routers/github-app.ts` - GitHub API endpoints
- `src/lib/auth.ts` - GitHub OAuth

## Architecture

### GitHub App

**App name:** Pinacle GitHub App (configured in GitHub)

**Permissions:**
- Repository: Read access (clone repos, read files)
- User: Read email, profile

**Installation:** Users install GitHub App to grant repository access

### Authentication Flow

**Implementation:** `src/lib/auth.ts` (NextAuth)

1. User clicks "Sign in with GitHub"
2. OAuth flow redirects to GitHub
3. User authorizes Pinacle app
4. GitHub returns access token
5. Store token in session

**Access token:** Used for GitHub API calls and git operations

## Features

### 1. Repository Cloning

**Implementation:** `src/lib/pod-orchestration/github-integration.ts` (`cloneRepository()`)

**Flow:**
1. Generate SSH key pair for pod
2. Add public key to GitHub (deploy key)
3. Clone via SSH: `git clone git@github.com:user/repo.git`
4. Checkout specified branch
5. Set up git user config

**SSH key management:**
- Private key stored in container
- Public key added as deploy key (read-only)
- Scoped per pod

**Location:** `/workspace` in container

### 2. Reading Files from GitHub

**Implementation:** `src/lib/trpc/routers/github-app.ts` (`getPinacleConfig` endpoint)

**Use case:** Read `pinacle.yaml` from existing repository during setup

**Flow:**
1. User selects existing repository
2. API calls GitHub Contents API
3. Read `pinacle.yaml` from specified branch
4. Parse and validate configuration
5. Pre-populate setup form

**API:** `GET /repos/:owner/:repo/contents/:path`

**Error handling:**
- File not found → Use defaults
- Invalid YAML → Show error
- No permission → Request access

### 3. File Injection

**Implementation:** `src/lib/pod-orchestration/github-integration.ts` (`injectPinacleConfig()`)

**Use case:** Write `pinacle.yaml` into container after provisioning

**Flow:**
1. Generate `PinacleConfig` from pod configuration
2. Serialize to YAML via `serializePinacleConfig()`
3. Write to `/workspace/pinacle.yaml` via SSH
4. User can commit in next push

**Benefits:**
- Version-controlled configuration
- Portable across pods
- Infrastructure-as-code

### 4. Repository Selection

**Implementation:** `src/components/setup/repository-selector.tsx`

**Modes:**

**New repository:**
- User creates new GitHub repo
- Pinacle initializes with template
- Commits `pinacle.yaml`, `.gitignore`, etc.

**Existing repository:**
- User selects from GitHub repos
- Pinacle clones and detects setup
- Reads existing `pinacle.yaml` if present

**API endpoint:** `github.getUserRepos` in `src/lib/trpc/routers/github-app.ts`

### 5. Branch Selection

**Implementation:** Repository selector component

**Options:**
- Default: `main` or `master`
- User can specify custom branch
- Branch created if doesn't exist (for new repos)

## GitHub API Integration

**Implementation:** `src/lib/trpc/routers/github-app.ts`

### Endpoints

**`getUserRepos`**
- Lists all repositories user has access to
- Includes organizations
- Filtered by permissions (read/write)

**`getRepoBranches`**
- Lists branches for a repository
- Used for branch selection

**`getPinacleConfig`**
- Reads `pinacle.yaml` from repository
- Returns parsed configuration
- Used during setup for existing repos

**`createRepository`** (future)
- Creates new GitHub repository
- Initializes with template
- Commits initial files

### Rate Limiting

**GitHub API limits:**
- Authenticated: 5,000 requests/hour
- Unauthenticated: 60 requests/hour

**Handling:**
- Use authenticated requests (user token)
- Cache repository lists
- Batch requests when possible

## Security

### SSH Keys

**Key management:**
- Generated per pod
- Private key never leaves container
- Public key added as deploy key (read-only)

**Key lifecycle:**
1. Generate on pod creation
2. Add to GitHub via API
3. Store private key in container (`/root/.ssh/`)
4. Remove from GitHub on pod deletion

### Access Control

**Repository access:**
- User must have read access to clone
- Deploy keys are read-only by default
- Write access requires personal access token (future)

**Token storage:**
- OAuth tokens in session (encrypted)
- Deploy keys in container filesystem
- No tokens in database

## Git Operations

**Implementation:** `src/lib/pod-orchestration/github-integration.ts`

All git operations via SSH commands:

**Clone:**
```bash
git clone git@github.com:user/repo.git /workspace
```

**Checkout branch:**
```bash
cd /workspace && git checkout <branch>
```

**Configure user:**
```bash
git config user.name "<username>"
git config user.email "<email>"
```

**Future operations:**
- Commit changes
- Push to branch
- Create pull requests
- Sync with remote

## Error Handling

**Common failures:**
- Repository not found → Show error, allow retry
- No permission → Request GitHub App installation
- Branch not found → Show error, suggest default branch
- Clone timeout → Retry with exponential backoff
- SSH key failure → Regenerate keys

**Implementation:** Try-catch blocks with descriptive error messages

## Future Enhancements

**Planned features:**

1. **Auto-commit**
   - Automatically commit changes
   - Push to branch periodically
   - Configurable frequency

2. **Pull request creation**
   - Create PR from pod changes
   - Link to pod for review
   - Merge and deploy

3. **Webhook integration**
   - Listen for push events
   - Auto-pull latest changes
   - Rebuild services if needed

4. **Multi-repository support**
   - Link multiple repos to one pod
   - Monorepo support
   - Submodules

5. **Git operations UI**
   - Commit from web interface
   - View git history
   - Manage branches

## Related Documentation

- [pod-config-representations.md](./pod-config-representations.md) - pinacle.yaml structure
- [02-pod-configuration.md](./02-pod-configuration.md) - Configuration system
- `src/lib/pod-orchestration/github-integration.ts` - Implementation
- `src/lib/trpc/routers/github-app.ts` - API endpoints
