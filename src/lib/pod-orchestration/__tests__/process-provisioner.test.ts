import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateKSUID } from "../../utils";
import { NetworkManager } from "../network-manager";
import { PodManager } from "../pod-manager";
import { ProcessProvisioner } from "../process-provisioner";
import type { PodSpec, ProcessConfig } from "../types";
import { getServerConnection } from "./test-helpers";

describe("ProcessProvisioner Integration Tests", () => {
  let testPodId: string;
  let podManager: PodManager;
  let networkManager: NetworkManager;
  let processProvisioner: ProcessProvisioner;

  beforeAll(async () => {
    testPodId = generateKSUID();
    const serverConnection = await getServerConnection();
    podManager = new PodManager(testPodId, serverConnection);
    networkManager = new NetworkManager(serverConnection);
    processProvisioner = new ProcessProvisioner(testPodId, serverConnection);
  }, 60_000);

  afterAll(async () => {
    // Cleanup: destroy pod and network
    try {
      await podManager.cleanupPod();
    } catch (error) {
      console.log("Cleanup error (expected if pod doesn't exist):", error);
    }

    try {
      await networkManager.destroyPodNetwork(testPodId);
    } catch (error) {
      console.log("Network cleanup error (expected):", error);
    }
  }, 60_000);

  it("should handle install command for new repo", async () => {
    console.log(`\n📦 Creating test pod ${testPodId}...`);

    const podConfig: PodSpec = {
      id: testPodId,
      name: "Test Process Pod",
      slug: "test-process-pod",
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
      installCommand: "echo 'Installing dependencies...' && sleep 1",
      workingDir: "/workspace",
      user: "root",
    };

    // Create the pod
    const podInstance = await podManager.createPod(podConfig);
    expect(podInstance.status).toBe("running");
    expect(podInstance.container).toBeDefined();

    console.log(`✅ Pod created successfully`);

    // Test install command
    console.log(`\n📝 Running install command...`);
    await processProvisioner.runInstall(podConfig, false);
    console.log(`✅ Install command completed`);
  }, 120_000);

  it("should provision and start a process in tmux", async () => {
    const process: ProcessConfig = {
      name: "test-app",
      displayName: "Test App",
      startCommand: "while true; do echo 'Hello from process'; sleep 5; done",
      tmuxSession: `process-${testPodId}-test-app`,
    };

    const podConfig: PodSpec = {
      id: testPodId,
      name: "Test Process Pod",
      slug: "test-process-pod",
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
      processes: [process],
      workingDir: "/workspace",
      user: "root",
    };

    console.log(`\n📝 Provisioning process ${process.name}...`);
    await processProvisioner.provisionProcess(podConfig, process, false);
    console.log(`✅ Process provisioned successfully`);

    console.log(`\n📝 Starting process ${process.name}...`);
    await processProvisioner.startProcess(podConfig, process);
    console.log(`✅ Process started successfully`);

    // Wait a moment for tmux session to be created
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // List tmux sessions to verify process is running
    console.log(`\n📝 Listing tmux sessions...`);
    const sessions = await processProvisioner.listTmuxSessions();
    console.log(`Found tmux sessions:`, sessions);

    expect(sessions).toContain(`process-${testPodId}-test-app`);
    console.log(`✅ Process is running in tmux session`);

    // Stop the process
    console.log(`\n📝 Stopping process ${process.name}...`);
    await processProvisioner.stopProcess(process);
    console.log(`✅ Process stopped successfully`);
  }, 120_000);

  it("should handle install failure gracefully for existing repo", async () => {
    const podConfig: PodSpec = {
      id: testPodId,
      name: "Test Process Pod",
      slug: "test-process-pod",
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
      installCommand: "exit 1", // Intentional failure
      workingDir: "/workspace",
      user: "root",
    };

    console.log(`\n📝 Testing install failure for existing repo...`);

    // Should NOT throw for existing repo
    await expect(
      processProvisioner.runInstall(podConfig, true),
    ).resolves.not.toThrow();

    console.log(`✅ Install failure handled gracefully for existing repo`);
  }, 60_000);

  it("should fail install for new repo on error", async () => {
    const podConfig: PodSpec = {
      id: testPodId,
      name: "Test Process Pod",
      slug: "test-process-pod",
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
      installCommand: "exit 1", // Intentional failure
      workingDir: "/workspace",
      user: "root",
    };

    console.log(`\n📝 Testing install failure for new repo...`);

    // SHOULD throw for new repo
    await expect(
      processProvisioner.runInstall(podConfig, false),
    ).rejects.toThrow("Install command failed");

    console.log(`✅ Install failure correctly throws for new repo`);
  }, 60_000);
});
