import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { PodTemplate } from "./template-registry";
import type { PodManager } from "./types";

const execAsync = promisify(exec);

export type SSHKeyPair = {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
};

export type GitHubDeployKey = {
  id: number;
  key: string;
  title: string;
  readOnly: boolean;
};

export type GitHubRepoSetup = {
  type: "existing" | "new";
  repository: string; // owner/repo format
  branch?: string;
  sshKeyPair: SSHKeyPair;
  deployKeyId?: number;
};

/**
 * GitHub integration for pod orchestration
 * Handles SSH key generation, repository cloning, and template initialization
 */
export class GitHubIntegration {
  private podManager: PodManager;

  constructor(podManager: PodManager) {
    this.podManager = podManager;
  }

  /**
   * Generate an SSH key pair for repository access
   */
  async generateSSHKeyPair(podId: string): Promise<SSHKeyPair> {
    console.log(`[GitHubIntegration] Generating SSH key pair for pod ${podId}`);

    // Generate ED25519 key (more secure and shorter than RSA)
    const keyPath = `/tmp/pinacle-pod-${podId}`;
    const command = `ssh-keygen -t ed25519 -C "pinacle-pod-${podId}" -f ${keyPath} -N ""`;

    try {
      await execAsync(command);

      // Read the generated keys
      const { stdout: publicKey } = await execAsync(`cat ${keyPath}.pub`);
      const { stdout: privateKey } = await execAsync(`cat ${keyPath}`);

      // Get fingerprint
      const { stdout: fingerprint } = await execAsync(
        `ssh-keygen -lf ${keyPath}.pub | awk '{print $2}'`,
      );

      // Clean up temporary files
      await execAsync(`rm -f ${keyPath} ${keyPath}.pub`);

      return {
        publicKey: publicKey.trim(),
        privateKey: privateKey.trim(),
        fingerprint: fingerprint.trim(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[GitHubIntegration] Failed to generate SSH key: ${errorMessage}`,
      );
      throw new Error(`SSH key generation failed: ${errorMessage}`);
    }
  }

  /**
   * Clone an existing repository into the pod
   */
  async cloneRepository(
    podId: string,
    repository: string,
    branch: string | undefined,
    sshKeyPair: SSHKeyPair,
  ): Promise<void> {
    console.log(
      `[GitHubIntegration] Cloning repository ${repository}:${branch} into container ${podId}`,
    );

    try {
      // 1. Copy SSH private key into container
      await this.podManager.execInPod(podId, [
        "mkdir",
        "-p",
        "/workspace/.ssh",
      ]);

      const escapedPrivateKey = sshKeyPair.privateKey.replace(/"/g, '\\"');
      await this.podManager.execInPod(podId, [
        "sh",
        "-c",
        `'echo "${escapedPrivateKey}" > /workspace/.ssh/id_ed25519 && chmod 600 /workspace/.ssh/id_ed25519'`,
      ]);

      // 2. Configure SSH to accept GitHub's host key automatically
      await this.podManager.execInPod(podId, [
        "sh",
        "-c",
        `'echo "Host github.com\n\tStrictHostKeyChecking accept-new\n\tUserKnownHostsFile /dev/null" > /workspace/.ssh/config'`,
      ]);

      await this.podManager.execInPod(podId, [
        "sh",
        "-c",
        "mkdir -p /workspace/.ssh && ssh-keyscan github.com >> /workspace/.ssh/known_hosts",
      ]);

      // 3. Configure git
      await this.podManager.execInPod(podId, [
        "git",
        "config",
        "--global",
        "user.email",
        `pod@pinacle.dev`,
      ]);
      await this.podManager.execInPod(podId, [
        "git",
        "config",
        "--global",
        "user.name",
        `Pinacle Pod`,
      ]);

      // 4. Clone the repository
      const gitUrl =
        repository.startsWith("git@") || repository.startsWith("https://")
          ? repository
          : `git@github.com:${repository}.git`;
      await this.podManager.execInPod(podId, [
        "sh",
        "-c",
        `cd /workspace && git clone ${branch ? `-b ${branch}` : ""} ${gitUrl}`,
      ]);

      console.log(`[GitHubIntegration] Successfully cloned ${repository}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[GitHubIntegration] Failed to clone repository: ${errorMessage}`,
      );
      throw new Error(`Repository clone failed: ${errorMessage}`);
    }
  }

  /**
   * Initialize a new project from a template
   */
  async initializeTemplate(
    podId: string,
    template: PodTemplate,
    repository: string,
    sshKeyPair: SSHKeyPair,
  ): Promise<void> {
    console.log(
      `[GitHubIntegration] Initializing template ${template.id} for ${repository}`,
    );

    try {
      // 1. Setup SSH key (same as clone)
      await this.podManager.execInPod(podId, [
        "mkdir",
        "-p",
        "/workspace/.ssh",
      ]);

      const escapedPrivateKey = sshKeyPair.privateKey.replace(/'/g, "'\\''");
      await this.podManager.execInPod(podId, [
        "sh",
        "-c",
        `'echo '${escapedPrivateKey}' > /workspace/.ssh/id_ed25519 && chmod 600 /workspace/.ssh/id_ed25519'`,
      ]);

      await this.podManager.execInPod(podId, [
        "sh",
        "-c",
        `'echo "Host github.com\n\tStrictHostKeyChecking accept-new\n\tUserKnownHostsFile /dev/null" > /workspace/.ssh/config'`,
      ]);

      // 2. Configure git
      await this.podManager.execInPod(podId, [
        "git",
        "config",
        "--global",
        "user.email",
        `pod@pinacle.dev`,
      ]);
      await this.podManager.execInPod(podId, [
        "git",
        "config",
        "--global",
        "user.name",
        `Pinacle Pod`,
      ]);

      // 3. Initialize git repository
      await this.podManager.execInPod(podId, ["git", "init", "/workspace"]);

      await this.podManager.execInPod(podId, [
        "sh",
        "-c",
        "'cd /workspace && git branch -M main'",
      ]);

      // 4. Add remote
      const gitUrl = `git@github.com:${repository}.git`;
      await this.podManager.execInPod(podId, [
        "sh",
        "-c",
        `'cd /workspace && git remote add origin ${gitUrl}'`,
      ]);

      // 5. Run template initialization script
      if (template.initScript && template.initScript.length > 0) {
        console.log(
          `[GitHubIntegration] Running template init script for ${template.id}`,
        );

        for (const cmd of template.initScript) {
          console.log(`[GitHubIntegration] Executing: ${cmd}`);
          await this.podManager.execInPod(podId, [
            "sh",
            "-c",
            `'${cmd.replace(/'/g, "'\\''")}'`,
          ]);
        }
      }

      // 6. Create initial commit
      await this.podManager.execInPod(podId, [
        "sh",
        "-c",
        "'cd /workspace && git add -A'",
      ]);

      await this.podManager.execInPod(podId, [
        "sh",
        "-c",
        `'cd /workspace && git commit -m "Initial commit from Pinacle (${template.name})" || true'`,
      ]);

      // 7. Push to GitHub
      await this.podManager.execInPod(podId, [
        "sh",
        "-c",
        "'cd /workspace && git push -u origin main'",
      ]);

      console.log(
        `[GitHubIntegration] Successfully initialized template and pushed to ${repository}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[GitHubIntegration] Failed to initialize template: ${errorMessage}`,
      );
      throw new Error(`Template initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Setup repository in pod (either clone existing or init from template)
   */
  async setupRepository(
    podId: string,
    setup: GitHubRepoSetup,
    template?: PodTemplate,
  ): Promise<void> {
    if (setup.type === "existing") {
      // Clone existing repository
      await this.cloneRepository(
        podId,
        setup.repository,
        setup.branch,
        setup.sshKeyPair,
      );
    } else if (setup.type === "new") {
      // Initialize from template
      if (!template) {
        throw new Error("Template is required for new projects");
      }
      await this.initializeTemplate(
        podId,
        template,
        setup.repository,
        setup.sshKeyPair,
      );
    }
  }
}
