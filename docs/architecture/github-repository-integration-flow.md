# GitHub Repository Integration Flow

## Overview

This document describes how GitHub repositories are integrated into the pod orchestration system, covering both existing repository cloning and new project template initialization.

## Complete Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant tRPC Router
    participant GitHub API
    participant Database
    participant PodManager
    participant GitHubIntegration
    participant Container

    User->>Frontend: Create Pod (select repo/template)
    Frontend->>tRPC Router: pods.create()

    alt New Project
        tRPC Router->>GitHub API: Create empty repository
        GitHub API-->>tRPC Router: Repository created
    end

    tRPC Router->>GitHubIntegration: generateSSHKeyPair()
    GitHubIntegration-->>tRPC Router: SSH Key Pair

    tRPC Router->>GitHub API: createDeployKey(publicKey)
    GitHub API-->>tRPC Router: Deploy Key ID

    tRPC Router->>Database: Store SSH key (encrypted)
    tRPC Router->>Database: Store pod record

    tRPC Router->>PodManager: createPod(config + sshKeyPair)

    PodManager->>Container: Create & Start Container
    PodManager->>GitHubIntegration: setupRepository()

    alt Existing Repository
        GitHubIntegration->>Container: Inject SSH key
        GitHubIntegration->>Container: git clone repo
    else New Project (Template)
        GitHubIntegration->>Container: Inject SSH key
        GitHubIntegration->>Container: git init
        GitHubIntegration->>Container: Run template init script
        GitHubIntegration->>Container: git commit & push
    end

    PodManager->>PodManager: Provision Services
    PodManager->>PodManager: Start Services
    PodManager-->>tRPC Router: Pod Created
    tRPC Router-->>Frontend: Success
    Frontend-->>User: Pod Running
```

## Detailed Steps

### 1. Frontend/Setup Flow

**User Actions:**
- User selects either:
  - **Existing Repository**: Choose from their GitHub repos
  - **New Project**: Choose template + org + repo name

**Code Location:** `src/components/setup/setup-form.tsx`

```typescript
// User selects existing repository
setupType: "repository"
selectedRepo: "owner/repo-name"

// OR user creates new project
setupType: "new"
selectedOrg: "owner"
newRepoName: "my-new-project"
selectedBundle: "nextjs-pro"
```

### 2. tRPC Router: Repository & SSH Key Setup

**Code Location:** `src/lib/trpc/routers/pods.ts`

#### Step 2a: Create Repository (if new project)

```typescript
if (isNewProject && newRepoName && selectedOrg) {
  // Create repository on GitHub
  const octokit = await getInstallationOctokit(installationId);

  const { data: repository } = await octokit.request("POST /orgs/{org}/repos", {
    org: selectedOrg,
    name: newRepoName,
    private: true,
    auto_init: false, // Empty repo, we'll init from template
  });

  finalGithubRepo = repository.full_name; // "owner/repo"
}
```

#### Step 2b: Generate SSH Key Pair

```typescript
const githubIntegration = new GitHubIntegration();
const sshKeyPair = await githubIntegration.generateSSHKeyPair(podId);

// sshKeyPair = {
//   publicKey: "ssh-ed25519 AAAA...",
//   privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\n...",
//   fingerprint: "SHA256:..."
// }
```

#### Step 2c: Add Deploy Key to GitHub

```typescript
const octokit = await getInstallationOctokit(installationId);
const [owner, repo] = finalGithubRepo.split("/");

const { data: deployKey } = await octokit.rest.repos.createDeployKey({
  owner,
  repo,
  title: `Pinacle Pod ${podId}`,
  key: sshKeyPair.publicKey,
  read_only: false, // Allow push for new projects
});

// deployKey.id = 12345 (GitHub's deploy key ID)
```

#### Step 2d: Store in Database

```typescript
// Store SSH key (encrypted) in database
await db.sshKeys.create({
  data: {
    podId,
    publicKey: sshKeyPair.publicKey,
    privateKeyEncrypted: encrypt(sshKeyPair.privateKey), // Encrypted!
    githubKeyId: deployKey.id,
    fingerprint: sshKeyPair.fingerprint,
  }
});

// Store pod record
const [pod] = await db.pods.insert({
  name,
  slug,
  githubRepo: finalGithubRepo,
  githubBranch: "main",
  isNewProject,
  status: "creating",
  // ... other fields
});
```

#### Step 2e: Call PodManager

```typescript
const podManager = new DefaultPodManager();

await podManager.createPod({
  id: pod.id,
  name: pod.name,
  slug: pod.slug,
  githubRepo: finalGithubRepo,
  githubBranch: "main",
  templateId: selectedBundle, // e.g., "nextjs-pro"

  // Pass SSH key directly (NOT stored in image!)
  githubRepoSetup: {
    type: isNewProject ? "new" : "existing",
    sshKeyPair: sshKeyPair, // ← INJECTED as parameter
    deployKeyId: deployKey.id,
  },

  // ... resources, services, etc.
});
```

### 3. PodManager: Pod Creation

**Code Location:** `src/lib/pod-orchestration/pod-manager.ts`

```typescript
async createPod(spec: PodSpec): Promise<PodInstance> {
  // 1. Create network
  await this.networkManager.createPodNetwork(spec.id);

  // 2. Create & start container
  const container = await this.containerRuntime.createContainer(spec);
  await this.containerRuntime.startContainer(container.id);

  // 3. Setup GitHub repository (if configured)
  if (spec.githubRepo && spec.githubRepoSetup) {
    await this.setupGitHubRepository(container.id, spec);
  }

  // 4. Provision services (code-server, vibe-kanban, etc.)
  await this.provisionServices(spec);

  // 5. Start services
  await this.startServices(spec);

  // 6. Pod is now running!
  return podInstance;
}
```

### 4. GitHubIntegration: Repository Setup

**Code Location:** `src/lib/pod-orchestration/github-integration.ts`

#### Step 4a: Inject SSH Key into Container

```typescript
// SSH key is NEVER in the Docker image
// It's injected at runtime via docker exec

// 1. Create .ssh directory
await execInContainer(containerId, ["mkdir", "-p", "/root/.ssh"]);

// 2. Write private key
const escapedPrivateKey = sshKeyPair.privateKey.replace(/'/g, "'\\''");
await execInContainer(containerId, [
  "sh", "-c",
  `'echo ${escapedPrivateKey} > /root/.ssh/id_ed25519 && chmod 600 /root/.ssh/id_ed25519'`
]);

// 3. Configure SSH to accept GitHub's host key
await execInContainer(containerId, [
  "sh", "-c",
  "'echo \"Host github.com\\n\\tStrictHostKeyChecking accept-new\" > /root/.ssh/config'"
]);
```

#### Step 4b: Clone Existing Repository

```typescript
if (setup.type === "existing") {
  // Configure git
  await execInContainer(containerId, [
    "git", "config", "--global", "user.email", "pod@pinacle.dev"
  ]);
  await execInContainer(containerId, [
    "git", "config", "--global", "user.name", "Pinacle Pod"
  ]);

  // Clone repository
  const gitUrl = `git@github.com:${repository}.git`;
  await execInContainer(containerId, [
    "git", "clone", "-b", branch, gitUrl, "/workspace"
  ]);
}
```

#### Step 4c: Initialize from Template (New Project)

```typescript
else if (setup.type === "new") {
  // 1. Initialize git repository
  await execInContainer(containerId, ["git", "init", "/workspace"]);
  await execInContainer(containerId, [
    "sh", "-c", "'cd /workspace && git branch -M main'"
  ]);

  // 2. Add remote
  const gitUrl = `git@github.com:${repository}.git`;
  await execInContainer(containerId, [
    "sh", "-c", `'cd /workspace && git remote add origin ${gitUrl}'`
  ]);

  // 3. Run template initialization script
  // Example for nextjs template:
  const template = getTemplate("nextjs-pro");
  for (const cmd of template.initScript) {
    // cmd = "npx create-next-app@latest . --typescript --tailwind ..."
    await execInContainer(containerId, ["sh", "-c", `'${cmd}'`]);
  }

  // 4. Commit and push
  await execInContainer(containerId, [
    "sh", "-c", "'cd /workspace && git add -A'"
  ]);
  await execInContainer(containerId, [
    "sh", "-c", `'cd /workspace && git commit -m "Initial commit from Pinacle"'`
  ]);
  await execInContainer(containerId, [
    "sh", "-c", "'cd /workspace && git push -u origin main'"
  ]);
}
```

## Key Security Points

### SSH Key Management

✅ **GOOD Practices:**
- SSH keys are generated on-demand (not pre-generated)
- Private keys are stored **encrypted** in the database
- Keys are injected at runtime via `docker exec` (not in image)
- Keys are pod-specific (one key per pod)
- Deploy keys are **deleted** when pod is destroyed

❌ **NOT Done:**
- Keys are NOT in the Docker image
- Keys are NOT in environment variables
- Keys are NOT committed to git
- Keys do NOT persist in the container filesystem after deletion

### Deploy Key vs User Key

**Deploy Key** (What we use):
- Scoped to a single repository
- Can be read-only or read-write
- Can be managed per-pod
- Deleted when pod is destroyed

**User Key** (NOT used):
- Would give access to ALL user repos
- Cannot be scoped
- Security risk if compromised

## Template Initialization Scripts

**Location:** `src/lib/pod-orchestration/template-registry.ts`

### Example: Next.js Template

```typescript
{
  id: "nextjs-pro",
  templateType: "nextjs",
  initScript: [
    "cd /workspace",
    "npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias '@/*' --no-git",
    "npm install",
  ],
}
```

### Example: Vite Template

```typescript
{
  id: "vite-starter",
  templateType: "vite",
  initScript: [
    "cd /workspace",
    "npm create vite@latest . -- --template react-ts",
    "npm install",
  ],
}
```

### Example: Custom/Blank Template

```typescript
{
  id: "custom-setup",
  templateType: "blank",
  // No init script - just blank workspace
}
```

## Testing Strategy

### Unit Tests (with Mocks)

```typescript
describe("GitHubIntegration", () => {
  it("should generate SSH key pair", async () => {
    const github = new GitHubIntegration();
    const keyPair = await github.generateSSHKeyPair("test-pod");

    expect(keyPair.publicKey).toContain("ssh-ed25519");
    expect(keyPair.privateKey).toContain("PRIVATE KEY");
    expect(keyPair.fingerprint).toContain("SHA256:");
  });

  it("should clone existing repository", async () => {
    const github = new GitHubIntegration();
    const mockExec = vi.spyOn(github as any, "execInContainer");

    await github.cloneRepository(
      "container-id",
      "owner/repo",
      "main",
      mockSSHKey
    );

    expect(mockExec).toHaveBeenCalledWith(
      "container-id",
      expect.arrayContaining(["git", "clone"])
    );
  });
});
```

### Integration Tests (with Real Container)

```typescript
describe("Pod with GitHub Repository", () => {
  it("should create pod and clone repository", async () => {
    const podManager = new DefaultPodManager();

    const pod = await podManager.createPod({
      name: "test-pod",
      githubRepo: "test-user/test-repo",
      githubRepoSetup: {
        type: "existing",
        sshKeyPair: await generateTestSSHKey(),
      },
      // ... other config
    });

    // Verify repository was cloned
    const { stdout } = await execInContainer(
      pod.container.id,
      ["ls", "/workspace"]
    );
    expect(stdout).toContain("package.json");
  });
});
```

## Cleanup on Pod Deletion

When a pod is deleted:

1. **Remove Deploy Key from GitHub**
```typescript
await octokit.rest.repos.deleteDeployKey({
  owner,
  repo,
  key_id: sshKey.githubKeyId,
});
```

2. **Delete SSH Key from Database**
```typescript
await db.sshKeys.delete({
  where: { podId }
});
```

3. **Container is Destroyed**
- SSH keys in container filesystem are automatically deleted
- No cleanup needed inside container

## Future Enhancements

### Potential Improvements:
- [ ] Support for multiple deploy keys (multi-repo pods)
- [ ] SSH key rotation (regenerate keys periodically)
- [ ] Git hooks integration (pre-commit, pre-push)
- [ ] Branch protection (prevent force push to main)
- [ ] Automatic dependency detection (analyze package.json)
- [ ] Custom template creation UI

### Not Planned (Keep It Simple):
- ❌ Git LFS support (use external storage)
- ❌ Submodules (complex, rarely needed)
- ❌ Multiple remote tracking (one repo per pod)
- ❌ Git GUI in browser (use VS Code git extension)

## Summary

The SSH key flow is:

1. **Generated**: On-demand when pod is created
2. **Stored**: Encrypted in database
3. **Injected**: At runtime via `docker exec` (parameter, not baked in)
4. **Used**: For git clone/push operations
5. **Deleted**: When pod is destroyed

This approach is secure, scalable, and follows best practices for secrets management in containerized environments.

