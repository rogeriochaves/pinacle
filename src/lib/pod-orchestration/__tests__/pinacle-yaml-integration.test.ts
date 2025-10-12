import { exec } from "node:child_process";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { LimaGVisorRuntime } from "../container-runtime";
import { GitHubIntegration } from "../github-integration";
import { getLimaSshPort } from "../lima-utils";
import { LimaNetworkManager } from "../network-manager";
import {
  generatePinacleConfigFromForm,
  parsePinacleConfig,
} from "../pinacle-config";
import { DefaultPodManager } from "../pod-manager";
import type { PodSpec } from "../types";

const execAsync = promisify(exec);

/**
 * Integration tests for pinacle.yaml functionality
 * Tests the full flow: form submission -> config generation -> pod creation -> file injection
 */
describe("Pinacle YAML Integration Tests", () => {
  let podManager: DefaultPodManager;
  let githubIntegration: GitHubIntegration;
  let containerRuntime: LimaGVisorRuntime;
  let networkManager: LimaNetworkManager;
  const testPodId = `pinacle-yaml-test-${Date.now()}`;

  beforeAll(async () => {
    // Check if Lima VM is running
    try {
      const { stdout } = await execAsync("limactl list --format json");
      const vms = stdout
        .trim()
        .split("\n")
        .map((json) => JSON.parse(json));
      const vm = vms.find(
        (vm) => vm.name === "gvisor-alpine" && vm.status === "Running",
      );

      if (!vm) {
        throw new Error(
          "gvisor-alpine Lima VM is not running. Start it with: limactl start gvisor-alpine",
        );
      }

      console.log(`✅ Lima VM ${vm.name} is running`);
    } catch (error) {
      console.error("Lima VM check failed:", error);
      throw error;
    }

    // Clean up any existing test containers
    const sshPort = await getLimaSshPort("gvisor-alpine");
    const limaConfig = { vmName: "gvisor-alpine", sshPort };
    containerRuntime = new LimaGVisorRuntime(limaConfig);
    networkManager = new LimaNetworkManager(limaConfig);
    podManager = new DefaultPodManager(limaConfig);
    githubIntegration = new GitHubIntegration(podManager);

    const containers = await containerRuntime.listContainers();
    const testContainers = containers.filter((c) =>
      c.podId.includes("pinacle-yaml-test"),
    );
    for (const container of testContainers) {
      await containerRuntime.removeContainer(container.id);
    }

    const networks = await networkManager.listPodNetworks();
    const testNetworks = networks.filter((n) =>
      n.podId.includes("pinacle-yaml-test"),
    );
    for (const network of testNetworks) {
      await networkManager.destroyPodNetwork(network.podId);
    }
  }, 60_000);

  it("should generate pinacle.yaml from form submission", () => {
    // Simulate form data from user
    const formData = {
      template: "nextjs",
      tier: "dev.medium",
      customServices: ["claude-code", "vibe-kanban", "code-server"],
    };

    // Generate config
    const config = generatePinacleConfigFromForm(formData);

    // Verify the config matches expectations
    expect(config.version).toBe("1.0");
    expect(config.template).toBe("nextjs");
    expect(config.tier).toBe("dev.medium");
    expect(config.services).toEqual([
      "claude-code",
      "vibe-kanban",
      "code-server",
    ]);
  });

  it("should inject pinacle.yaml into a running pod", async () => {
    console.log(`\n📦 Creating test pod ${testPodId}...`);

    // Create a minimal pod config
    const podConfig: PodSpec = {
      id: testPodId,
      name: "Test Pinacle YAML Pod",
      slug: "test-pinacle-yaml-pod",
      baseImage: "alpine:3.22.1",
      resources: {
        tier: "dev.small",
        cpuCores: 0.5,
        memoryMb: 256,
        storageMb: 1024,
      },
      network: {
        ports: [],
      },
      services: [],
      environment: {},
      workingDir: "/workspace",
      user: "root",
    };

    // Create the pod
    const podInstance = await podManager.createPod(podConfig);
    expect(podInstance.status).toBe("running");
    expect(podInstance.container).toBeDefined();

    console.log(`✅ Pod created successfully`);

    // Generate pinacle.yaml config from "form submission"
    const pinacleConfig = generatePinacleConfigFromForm({
      template: "nextjs",
      tier: "dev.medium",
      customServices: ["openai-codex", "vibe-kanban"],
    });

    console.log(`\n📝 Injecting pinacle.yaml...`);

    // Inject pinacle.yaml into the pod
    await githubIntegration.injectPinacleConfig(testPodId, pinacleConfig, "my-test-app");

    console.log(`✅ pinacle.yaml injected`);

    // Verify the file exists in the pod
    const { stdout: lsOutput } = await podManager.execInPod(testPodId, [
      "ls",
      "-la",
      "/workspace",
    ]);

    expect(lsOutput).toContain("pinacle.yaml");
    console.log(`✅ pinacle.yaml file exists in /workspace`);

    // Read the file content from the pod
    const { stdout: fileContent } = await podManager.execInPod(testPodId, [
      "cat",
      "/workspace/pinacle.yaml",
    ]);

    console.log(`\n📄 pinacle.yaml content:`);
    console.log(fileContent);

    // Verify the content
    expect(fileContent).toContain('version: "1.0"');
    expect(fileContent).toContain('name: "my-test-app"');
    expect(fileContent).toContain('template: "nextjs"');
    expect(fileContent).toContain("tier: dev.medium");
    expect(fileContent).toContain("- openai-codex");
    expect(fileContent).toContain("- vibe-kanban");

    console.log(`✅ pinacle.yaml content verified`);

    // Parse the content to verify it's valid
    const parsedConfig = parsePinacleConfig(fileContent);
    expect(parsedConfig.template).toBe("nextjs");
    expect(parsedConfig.tier).toBe("dev.medium");
    expect(parsedConfig.services).toEqual(["openai-codex", "vibe-kanban"]);

    console.log(`✅ Parsed config matches original`);

    // Clean up
    console.log(`\n🧹 Cleaning up test pod...`);
    await podManager.deletePod(testPodId);
    console.log(`✅ Test pod deleted`);
  }, 120_000);

  it("should update pinacle.yaml when services change", async () => {
    const updateTestPodId = `pinacle-yaml-update-test-${Date.now()}`;

    console.log(`\n📦 Creating pod for update test ${updateTestPodId}...`);

    // Create a minimal pod
    const podConfig: PodSpec = {
      id: updateTestPodId,
      name: "Test Update Pod",
      slug: "test-update-pod",
      baseImage: "alpine:3.22.1",
      resources: {
        tier: "dev.small",
        cpuCores: 0.5,
        memoryMb: 256,
        storageMb: 1024,
      },
      network: {
        ports: [],
      },
      services: [],
      environment: {},
      workingDir: "/workspace",
      user: "root",
    };

    await podManager.createPod(podConfig);

    // Initial config
    const initialConfig = generatePinacleConfigFromForm({
      template: "vite",
      tier: "dev.small",
      customServices: ["claude-code", "code-server"],
    });

    await githubIntegration.injectPinacleConfig(updateTestPodId, initialConfig, "my-test-app");

    // Verify initial state
    let { stdout: fileContent } = await podManager.execInPod(updateTestPodId, [
      "cat",
      "/workspace/pinacle.yaml",
    ]);

    expect(fileContent).toContain("claude-code");
    expect(fileContent).toContain("code-server");
    expect(fileContent).not.toContain("vibe-kanban");

    console.log(`✅ Initial config verified`);

    // Update config (user added vibe-kanban)
    const updatedConfig = generatePinacleConfigFromForm({
      template: "vite",
      tier: "dev.small",
      customServices: ["claude-code", "vibe-kanban", "code-server"],
    });

    console.log(`\n📝 Updating pinacle.yaml with new services...`);

    await githubIntegration.injectPinacleConfig(updateTestPodId, updatedConfig, "my-test-app");

    // Verify updated state
    ({ stdout: fileContent } = await podManager.execInPod(updateTestPodId, [
      "cat",
      "/workspace/pinacle.yaml",
    ]));

    expect(fileContent).toContain("claude-code");
    expect(fileContent).toContain("vibe-kanban");
    expect(fileContent).toContain("code-server");

    console.log(`✅ Updated config verified`);

    const parsedUpdated = parsePinacleConfig(fileContent);
    expect(parsedUpdated.services).toHaveLength(3);
    expect(parsedUpdated.services).toContain("vibe-kanban");

    console.log(`✅ Service added successfully`);

    // Clean up
    await podManager.deletePod(updateTestPodId);
  }, 120_000);

  it("should handle different coding assistants in config", async () => {
    const codingAssistantTestPodId = `pinacle-yaml-coding-${Date.now()}`;

    console.log(
      `\n📦 Creating pod for coding assistant test ${codingAssistantTestPodId}...`,
    );

    const podConfig: PodSpec = {
      id: codingAssistantTestPodId,
      name: "Test Coding Assistant Pod",
      slug: "test-coding-assistant-pod",
      baseImage: "alpine:3.22.1",
      resources: {
        tier: "dev.small",
        cpuCores: 0.5,
        memoryMb: 256,
        storageMb: 1024,
      },
      network: {
        ports: [],
      },
      services: [],
      environment: {},
      workingDir: "/workspace",
      user: "root",
    };

    await podManager.createPod(podConfig);

    // Test each coding assistant
    const codingAssistants = [
      "claude-code",
      "openai-codex",
      "cursor-cli",
      "gemini-cli",
    ];

    for (const assistant of codingAssistants) {
      console.log(`\n🤖 Testing ${assistant}...`);

      const config = generatePinacleConfigFromForm({
        tier: "dev.small",
        customServices: [assistant, "code-server"],
      });

      await githubIntegration.injectPinacleConfig(
        codingAssistantTestPodId,
        config,
        "my-test-app",
      );

      const { stdout: fileContent } = await podManager.execInPod(
        codingAssistantTestPodId,
        ["cat", "/workspace/pinacle.yaml"],
      );

      expect(fileContent).toContain(assistant);
      console.log(`  ✅ ${assistant} config verified`);
    }

    // Clean up
    await podManager.deletePod(codingAssistantTestPodId);
  }, 180_000);
});
