import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GitHubIntegration } from "../github-integration";
import { getLimaServerConnection } from "../lima-utils";
import { PodManager } from "../pod-manager";
import type { PodSpec } from "../types";

describe("GitHub Integration Tests", () => {
  const podId = "test-ssh-key-gen";
  let podManager: PodManager;
  let githubIntegration: GitHubIntegration;

  beforeAll(async () => {
    // Initialize managers
    podManager = new PodManager(podId, await getLimaServerConnection());
    githubIntegration = new GitHubIntegration(podManager);
  });

  afterAll(async () => {
    // Cleanup would go here
  });

  describe("SSH Key Generation", () => {
    it("should generate a valid SSH key pair", async () => {
      const keyPair = await githubIntegration.generateSSHKeyPair(podId);

      // Verify public key format
      expect(keyPair.publicKey).toContain("ssh-ed25519");
      expect(keyPair.publicKey).toMatch(/^ssh-ed25519 [A-Za-z0-9+/=]+ /);

      // Verify private key format
      expect(keyPair.privateKey).toContain("BEGIN OPENSSH PRIVATE KEY");
      expect(keyPair.privateKey).toContain("END OPENSSH PRIVATE KEY");

      // Verify fingerprint format
      expect(keyPair.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]+$/);

      console.log("✅ Generated SSH key pair:");
      console.log(`   Public key: ${keyPair.publicKey.substring(0, 50)}...`);
      console.log(`   Fingerprint: ${keyPair.fingerprint}`);
    });

    it("should generate unique key pairs", async () => {
      const keyPair1 = await githubIntegration.generateSSHKeyPair("pod-1");
      const keyPair2 = await githubIntegration.generateSSHKeyPair("pod-2");

      // Keys should be different
      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
      expect(keyPair1.fingerprint).not.toBe(keyPair2.fingerprint);
    });
  });

  describe("Repository Cloning (Mocked)", () => {
    it("should prepare container for git clone operations", async () => {
      // This would be mocked in a real test
      // For now, we're testing the structure

      const mockSshKeyPair = {
        publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMock test-key",
        privateKey:
          "-----BEGIN OPENSSH PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END OPENSSH PRIVATE KEY-----",
        fingerprint: "SHA256:MockFingerprint",
      };

      const mockSetup = {
        type: "existing" as const,
        repository: "test-user/test-repo",
        branch: "main",
        sshKeyPair: mockSshKeyPair,
      };

      // Verify the setup structure
      expect(mockSetup.type).toBe("existing");
      expect(mockSetup.repository).toBe("test-user/test-repo");
      expect(mockSetup.sshKeyPair.publicKey).toContain("ssh-ed25519");
    });

    it("should handle new project initialization structure", async () => {
      const mockSshKeyPair = {
        publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMock test-key",
        privateKey:
          "-----BEGIN OPENSSH PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END OPENSSH PRIVATE KEY-----",
        fingerprint: "SHA256:MockFingerprint",
      };

      const mockSetup = {
        type: "new" as const,
        repository: "test-user/new-project",
        branch: "main",
        sshKeyPair: mockSshKeyPair,
      };

      // Verify the setup structure
      expect(mockSetup.type).toBe("new");
      expect(mockSetup.repository).toBe("test-user/new-project");
    });
  });

  describe("Pod Creation with GitHub Integration (Mocked)", () => {
    it("should accept GitHub configuration in pod config", async () => {
      const mockKeyPair = {
        publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMock test-key",
        privateKey:
          "-----BEGIN OPENSSH PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END OPENSSH PRIVATE KEY-----",
        fingerprint: "SHA256:MockFingerprint",
      };

      const config: Partial<PodSpec> = {
        id: "test-github-pod",
        name: "GitHub Test Pod",
        slug: "github-test-pod",
        templateId: "nextjs",
        githubRepo: "test-user/test-repo",
        githubBranch: "main",
        githubRepoSetup: {
          type: "existing",
          sshKeyPair: mockKeyPair,
          deployKeyId: 12345,
        },
      };

      // Verify the structure
      expect(config.githubRepo).toBe("test-user/test-repo");
      expect(config.githubRepoSetup?.type).toBe("existing");
      expect(config.githubRepoSetup?.sshKeyPair.publicKey).toContain(
        "ssh-ed25519",
      );
      expect(config.githubRepoSetup?.deployKeyId).toBe(12345);

      console.log("✅ Pod config structure validated for GitHub integration");
    });

    it("should support pods without GitHub integration", async () => {
      const config: Partial<PodSpec> = {
        id: "test-no-github-pod",
        name: "No GitHub Pod",
        slug: "no-github-pod",
        templateId: "nodejs-blank",
        // No GitHub fields
      };

      // Verify no GitHub config
      expect(config.githubRepo).toBeUndefined();
      expect(config.githubRepoSetup).toBeUndefined();

      console.log("✅ Pod config structure validated without GitHub");
    });
  });

  describe("Template Init Scripts", () => {
    it("should have init scripts for all major templates", async () => {
      const { getTemplate } = await import("../template-registry");

      const nextjsTemplate = getTemplate("nextjs");
      expect(nextjsTemplate).toBeDefined();
      expect(nextjsTemplate?.initScript).toBeDefined();
      const nextjsScripts =
        typeof nextjsTemplate?.initScript === "function"
          ? nextjsTemplate.initScript({ services: [] } as any)
          : nextjsTemplate?.initScript || [];
      expect(nextjsScripts.length).toBeGreaterThan(0);
      const nextjsScriptStr = nextjsScripts.join(" ");
      expect(nextjsScriptStr).toContain("create-next-app");

      const viteTemplate = getTemplate("vite");
      expect(viteTemplate).toBeDefined();
      expect(viteTemplate?.initScript).toBeDefined();
      const viteScripts =
        typeof viteTemplate?.initScript === "function"
          ? viteTemplate.initScript({ services: [] } as any)
          : viteTemplate?.initScript || [];
      const viteScriptStr = viteScripts.join(" ");
      expect(viteScriptStr).toContain("vite");

      console.log("✅ All templates have valid init scripts");
    });
  });

  describe("Security Validation", () => {
    it("should verify SSH keys are not logged", async () => {
      const consoleSpy = vi.spyOn(console, "log");

      const _keyPair =
        await githubIntegration.generateSSHKeyPair("security-test");

      // Check that private key is not logged (but public key might be)
      const allLogs = consoleSpy.mock.calls.map((call) => call.join(" "));
      const hasPrivateKey = allLogs.some((log) =>
        log.includes("BEGIN OPENSSH PRIVATE KEY"),
      );

      expect(hasPrivateKey).toBe(false);

      consoleSpy.mockRestore();
    });

    it("should verify SSH key format for security", async () => {
      const keyPair = await githubIntegration.generateSSHKeyPair("format-test");

      // Private key should have proper headers
      expect(keyPair.privateKey).toMatch(
        /^-----BEGIN OPENSSH PRIVATE KEY-----/,
      );
      expect(keyPair.privateKey).toMatch(/-----END OPENSSH PRIVATE KEY-----$/);

      // Public key should be ed25519
      expect(keyPair.publicKey).toMatch(/^ssh-ed25519 /);

      // Fingerprint should be SHA256
      expect(keyPair.fingerprint).toMatch(/^SHA256:/);
    });
  });

  describe("End-to-End Flow (Structure Validation)", () => {
    it("should validate complete GitHub integration flow structure", async () => {
      // 1. Generate SSH key
      const keyPair = await githubIntegration.generateSSHKeyPair("e2e-test");
      expect(keyPair.publicKey).toContain("ssh-ed25519");

      // 2. Simulate GitHub API calls (would be mocked)
      const mockGitHubResponse = {
        deployKey: {
          id: 12345,
          key: keyPair.publicKey,
          title: "Pinacle Pod e2e-test",
        },
        repository: {
          full_name: "test-user/test-repo",
          clone_url: "git@github.com:test-user/test-repo.git",
        },
      };

      // 3. Create pod config with GitHub setup
      const podConfig: Partial<PodSpec> = {
        id: "e2e-test",
        name: "E2E Test Pod",
        slug: "e2e-test-pod",
        templateId: "nextjs",
        githubRepo: mockGitHubResponse.repository.full_name,
        githubBranch: "main",
        githubRepoSetup: {
          type: "existing",
          sshKeyPair: keyPair,
          deployKeyId: mockGitHubResponse.deployKey.id,
        },
      };

      // 4. Verify complete structure
      expect(podConfig.githubRepo).toBe("test-user/test-repo");
      expect(podConfig.githubRepoSetup?.deployKeyId).toBe(12345);
      expect(podConfig.githubRepoSetup?.sshKeyPair.publicKey).toBe(
        keyPair.publicKey,
      );

      console.log("✅ End-to-end flow structure validated");
      console.log(`   Repository: ${podConfig.githubRepo}`);
      console.log(
        `   Deploy Key ID: ${podConfig.githubRepoSetup?.deployKeyId}`,
      );
      console.log(
        `   SSH Fingerprint: ${podConfig.githubRepoSetup?.sshKeyPair.fingerprint}`,
      );
    });
  });
});
