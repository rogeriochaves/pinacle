import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getProjectFolderFromRepository } from "../utils";
import type { PinacleConfig } from "./pinacle-config";
import { serializePinacleConfig } from "./pinacle-config";
import type { PodManager } from "./pod-manager";
import type { PodTemplate } from "./template-registry";
import type { PodSpec } from "./types";

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
    dotenvContent?: string,
  ): Promise<void> {
    console.log(
      `[GitHubIntegration] Cloning repository ${repository}:${branch} into container ${podId}`,
    );

    try {
      // 1. Copy SSH private key into container
      await this.podManager.execInPod(["mkdir", "-p", "/workspace/.ssh"]);

      const escapedPrivateKey = sshKeyPair.privateKey.replace(/"/g, '\\"');
      await this.podManager.execInPod([
        "sh",
        "-c",
        `'echo "${escapedPrivateKey}" > /workspace/.ssh/id_ed25519 && chmod 600 /workspace/.ssh/id_ed25519'`,
      ]);

      // 2. Configure SSH to accept GitHub's host key automatically
      await this.podManager.execInPod([
        "sh",
        "-c",
        `'echo "Host github.com\n\tStrictHostKeyChecking accept-new\n\tUserKnownHostsFile /dev/null" > /workspace/.ssh/config'`,
      ]);

      await this.podManager.execInPod([
        "sh",
        "-c",
        "mkdir -p /workspace/.ssh && ssh-keyscan github.com >> /workspace/.ssh/known_hosts",
      ]);

      // 3. Configure git
      await this.podManager.execInPod([
        "git",
        "config",
        "--global",
        "user.email",
        `pod@pinacle.dev`,
      ]);
      await this.podManager.execInPod([
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
      await this.podManager.execInPod([
        "sh",
        "-c",
        `cd /workspace && git clone ${branch ? `-b ${branch} ` : ""}${gitUrl}`,
      ]);

      console.log(`[GitHubIntegration] Successfully cloned ${repository}`);

      // 5. Write .env file if we have dotenv content (before install commands run)
      if (dotenvContent) {
        const projectFolder = getProjectFolderFromRepository(repository);
        const envFilePath = `/workspace/${projectFolder}/.env`;

        const writeCommand = `cat > ${envFilePath} << 'DOTENV_EOF'
${dotenvContent}
DOTENV_EOF`;

        await this.podManager.execInPod(["sh", "-c", writeCommand]);
        console.log(`[GitHubIntegration] Wrote .env file to ${envFilePath}`);
      }
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
    template: PodTemplate,
    repository: string,
    sshKeyPair: SSHKeyPair,
    spec: PodSpec,
    pinacleConfig?: PinacleConfig,
    dotenvContent?: string,
  ): Promise<void> {
    console.log(
      `[GitHubIntegration] Initializing template ${template.id} for ${repository}`,
    );

    try {
      // Extract project folder name from repository
      const projectFolder = getProjectFolderFromRepository(repository)?.toLowerCase();
      if (!projectFolder) {
        throw new Error(
          `Could not extract project folder from repository: ${repository}`,
        );
      }

      const projectPath = `/workspace/${projectFolder}`;
      console.log(`[GitHubIntegration] Creating project in ${projectPath}`);

      // 1. Setup SSH key (same as clone)
      await this.podManager.execInPod(["mkdir", "-p", "/workspace/.ssh"]);

      const escapedPrivateKey = sshKeyPair.privateKey.replace(/"/g, '\\"');
      await this.podManager.execInPod([
        "sh",
        "-c",
        `'echo "${escapedPrivateKey}" > /workspace/.ssh/id_ed25519 && chmod 600 /workspace/.ssh/id_ed25519'`,
      ]);

      await this.podManager.execInPod([
        "sh",
        "-c",
        `'echo "Host github.com\n\tStrictHostKeyChecking accept-new\n\tUserKnownHostsFile /dev/null" > /workspace/.ssh/config'`,
      ]);

      // 2. Configure git
      await this.podManager.execInPod([
        "git",
        "config",
        "--global",
        "user.email",
        `pod@pinacle.dev`,
      ]);
      await this.podManager.execInPod([
        "git",
        "config",
        "--global",
        "user.name",
        `Pinacle Pod`,
      ]);

      // 3. Create project directory and initialize git repository there
      await this.podManager.execInPod(["mkdir", "-p", projectPath]);
      await this.podManager.execInPod([
        "git",
        "init",
        "-b",
        "main",
        projectPath,
      ]);

      // 4. Add remote
      const gitUrl = `git@github.com:${repository}.git`;
      await this.podManager.execInPod([
        "sh",
        "-c",
        `'cd ${projectPath} && git remote add origin ${gitUrl}'`,
      ]);

      // 4.5. Write .env file if we have dotenv content (before init script runs)
      if (dotenvContent) {
        const envFilePath = `${projectPath}/.env`;

        const writeCommand = `cat > ${envFilePath} << 'DOTENV_EOF'
${dotenvContent}
DOTENV_EOF`;

        await this.podManager.execInPod(["sh", "-c", writeCommand]);
        console.log(`[GitHubIntegration] Wrote .env file to ${envFilePath}`);
      }

      // 5. Run template initialization script
      if (template.initScript) {
        console.log(
          `[GitHubIntegration] Running template init script for ${template.id}`,
        );

        // Resolve initScript (could be array or function)
        const commands =
          typeof template.initScript === "function"
            ? template.initScript(spec)
            : template.initScript;

        for (const cmd of commands) {
          console.log(`[GitHubIntegration] Executing: ${cmd}`);
          // Run commands in the project directory
          await this.podManager.execInPod([
            "sh",
            "-c",
            `'cd ${projectPath} && ${cmd.replace(/'/g, "'\\''")}'`,
          ]);
        }
      }

      // 5.5. Inject pinacle.yaml before the initial commit
      if (pinacleConfig) {
        console.log(
          `[GitHubIntegration] Injecting pinacle.yaml into initial commit`,
        );
        const yamlContent = serializePinacleConfig(pinacleConfig);
        const escapedContent = yamlContent.replace(/'/g, "'\\''");

        await this.podManager.execInPod([
          "sh",
          "-c",
          `echo '${escapedContent}' > ${projectPath}/pinacle.yaml`,
        ]);

        console.log(
          `[GitHubIntegration] Successfully wrote pinacle.yaml to ${projectPath}`,
        );
      }

      // 6. Create initial commit
      await this.podManager.execInPod([
        "sh",
        "-c",
        `'cd ${projectPath} && git add -A'`,
      ]);

      await this.podManager.execInPod([
        "sh",
        "-c",
        `'cd ${projectPath} && git commit -m "Initial commit from Pinacle (${template.name})" || true'`,
      ]);

      // 7. Push to GitHub
      try {
        await this.podManager.execInPod([
          "sh",
          "-c",
          `'cd ${projectPath} && git push -u origin main'`,
        ]);
      } catch (error) {
        // Means we are retrying the provisioning, so we need to force push
        if (
          error instanceof Error &&
          error.message.includes("remote contains work")
        ) {
          await this.podManager.execInPod([
            "sh",
            "-c",
            `'cd ${projectPath} && git push --force -u origin main'`,
          ]);
        }
      }

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
    spec?: PodSpec,
    pinacleConfig?: PinacleConfig,
    dotenvContent?: string,
  ): Promise<void> {
    if (setup.type === "existing") {
      // Clone existing repository
      await this.cloneRepository(
        podId,
        setup.repository,
        setup.branch,
        setup.sshKeyPair,
        dotenvContent,
      );
    } else if (setup.type === "new") {
      // Initialize from template
      if (!template) {
        throw new Error("Template is required for new projects");
      }
      if (!spec) {
        throw new Error("PodSpec is required for new projects with templates");
      }
      await this.initializeTemplate(
        template,
        setup.repository,
        setup.sshKeyPair,
        spec,
        pinacleConfig,
        dotenvContent,
      );
    }
  }

  /**
   * Inject pinacle.yaml configuration file into the pod's workspace
   * This allows users to commit the file and version control their pod configuration
   */
  async injectPinacleConfig(
    spec: PinacleConfig,
    repository: string,
  ): Promise<void> {
    console.log(
      `[GitHubIntegration] Injecting pinacle.yaml into pod ${this.podManager.podId}`,
    );

    try {
      // Serialize the config to YAML format
      const yamlContent = serializePinacleConfig(spec);

      // Escape the content for shell
      const escapedContent = yamlContent.replace(/'/g, "'\\''");

      // Write the file to the workspace root
      const projectFolder = getProjectFolderFromRepository(repository);
      await this.podManager.execInPod([
        "sh",
        "-c",
        `echo '${escapedContent}' > /workspace/${projectFolder}/pinacle.yaml`,
      ]);

      console.log(
        `[GitHubIntegration] Successfully wrote pinacle.yaml to /workspace`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[GitHubIntegration] Failed to inject pinacle.yaml: ${errorMessage}`,
      );
      throw new Error(`Failed to write pinacle.yaml: ${errorMessage}`);
    }
  }
}
