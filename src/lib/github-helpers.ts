/**
 * GitHub Helper Functions
 *
 * High-level orchestration helpers for GitHub operations used across the application.
 * This module provides reusable functions for SSH key management, deploy keys, and
 * smart Octokit instance selection (OAuth vs GitHub App).
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Octokit } from "@octokit/rest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { githubInstallations, userGithubInstallations } from "./db/schema";
import { getInstallationOctokit } from "./github-app";
import type { SSHKeyPair } from "./pod-orchestration/github-integration";

const execAsync = promisify(exec);

/**
 * Check if a GitHub access token is valid by making a simple API call
 * Returns true if valid, false if expired/invalid
 */
export const checkGitHubTokenValidity = async (
  token: string,
): Promise<{ valid: boolean; error?: string }> => {
  try {
    const octokit = new Octokit({ auth: token });
    await octokit.request("GET /user");
    return { valid: true };
  } catch (error: unknown) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? (error as Record<string, unknown>).status
        : undefined;

    if (status === 401) {
      return {
        valid: false,
        error:
          "GITHUB_AUTH_EXPIRED: Your GitHub authentication has expired. Please sign out and sign in again to reconnect your GitHub account.",
      };
    }

    // For other errors, assume the token might still be valid
    // (could be network issues, rate limiting, etc.)
    return { valid: true };
  }
};

/**
 * Generate an SSH key pair for a pod
 * Uses ED25519 algorithm which is more secure and shorter than RSA
 */
export const generateSSHKeyPair = async (
  podId: string,
): Promise<SSHKeyPair> => {
  console.log(`[GitHubHelpers] Generating SSH key pair for pod ${podId}`);

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[GitHubHelpers] Failed to generate SSH key: ${errorMessage}`,
    );
    throw new Error(`SSH key generation failed: ${errorMessage}`);
  }
};

/**
 * Get the appropriate Octokit instance for a repository
 * Automatically selects between GitHub App installation token (for orgs) or OAuth token (for personal accounts)
 */
export const getOctokitForRepo = async (
  userId: string,
  repository: string,
  userGithubToken?: string,
): Promise<Octokit | Awaited<ReturnType<typeof getInstallationOctokit>>> => {
  const [owner] = repository.split("/");

  // Get user's installations
  const userInstallations = await db
    .select({
      installationId: githubInstallations.installationId,
      accountLogin: githubInstallations.accountLogin,
      accountType: githubInstallations.accountType,
    })
    .from(userGithubInstallations)
    .innerJoin(
      githubInstallations,
      eq(userGithubInstallations.installationId, githubInstallations.id),
    )
    .where(eq(userGithubInstallations.userId, userId));

  // Find the installation for the target organization/user
  const targetInstallation = userInstallations.find(
    (inst) => inst.accountLogin === owner,
  );

  if (targetInstallation && targetInstallation.accountType === "Organization") {
    // Use GitHub App installation token for organizations
    console.log(
      `[GitHubHelpers] Using GitHub App installation token for organization ${owner}`,
    );
    return await getInstallationOctokit(targetInstallation.installationId);
  }

  // Use user's OAuth token for personal accounts
  console.log(
    `[GitHubHelpers] Using user OAuth token for personal account ${owner}`,
  );
  if (!userGithubToken) {
    throw new Error(
      "User's GitHub OAuth token not found. Please sign out and sign in again.",
    );
  }
  return new Octokit({ auth: userGithubToken });
};

/**
 * Add a deploy key to a GitHub repository
 */
export const addDeployKeyToRepo = async (
  octokit: Octokit | Awaited<ReturnType<typeof getInstallationOctokit>>,
  repository: string,
  title: string,
  publicKey: string,
  readOnly: boolean,
): Promise<number> => {
  const [owner, repo] = repository.split("/");

  console.log(`[GitHubHelpers] Adding deploy key to ${repository}`);

  try {
    const response = await octokit.request("POST /repos/{owner}/{repo}/keys", {
      owner,
      repo,
      title,
      key: publicKey,
      read_only: readOnly,
    });

    console.log(
      `[GitHubHelpers] Added deploy key ${response.data.id} to ${repository}`,
    );

    return response.data.id;
  } catch (error: unknown) {
    // Check if this is a GitHub API error with status
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? (error as Record<string, unknown>).status
        : undefined;

    // Handle 401 errors specifically - this indicates expired or invalid credentials
    if (status === 401) {
      throw new Error(
        "GITHUB_AUTH_EXPIRED: Your GitHub authentication has expired. Please sign out and sign in again to reconnect your GitHub account.",
      );
    }

    throw error;
  }
};

/**
 * Remove a deploy key from a GitHub repository
 */
export const removeDeployKeyFromRepo = async (
  octokit: Octokit | Awaited<ReturnType<typeof getInstallationOctokit>>,
  repository: string,
  keyId: number,
): Promise<void> => {
  const [owner, repo] = repository.split("/");

  console.log(
    `[GitHubHelpers] Removing deploy key ${keyId} from ${repository}`,
  );

  await octokit.request("DELETE /repos/{owner}/{repo}/keys/{key_id}", {
    owner,
    repo,
    key_id: keyId,
  });

  console.log(`[GitHubHelpers] Removed deploy key ${keyId} from ${repository}`);
};

/**
 * Setup GitHub repository for a pod
 * Combines SSH key generation, Octokit selection, and deploy key creation
 * Returns a complete GitHubRepoSetup object ready for provisioning
 */
export const setupGitHubRepoForPod = async (params: {
  podId: string;
  podName: string;
  userId: string;
  repository: string;
  branch?: string;
  isNewProject: boolean;
  userGithubToken?: string;
}): Promise<{
  sshKeyPair: SSHKeyPair;
  deployKeyId: number;
  type: "new" | "existing";
  repository: string;
  branch?: string;
}> => {
  const {
    podId,
    podName,
    userId,
    repository,
    branch,
    isNewProject,
    userGithubToken,
  } = params;

  console.log(
    `[GitHubHelpers] Setting up GitHub repository ${repository} for pod ${podId}`,
  );

  // Generate SSH key pair
  const sshKeyPair = await generateSSHKeyPair(podId);

  // Get the appropriate Octokit instance
  const octokit = await getOctokitForRepo(userId, repository, userGithubToken);

  // Add deploy key to repository
  const deployKeyId = await addDeployKeyToRepo(
    octokit,
    repository,
    `Pinacle Pod ${podName} (${podId.slice(-8)})`,
    sshKeyPair.publicKey,
    !isNewProject, // Allow write access for new projects to push initial commit
  );

  return {
    sshKeyPair,
    deployKeyId,
    type: isNewProject ? "new" : "existing",
    repository,
    branch,
  };
};
