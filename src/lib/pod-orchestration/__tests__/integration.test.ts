import { exec } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  envSets,
  pods,
  servers,
  teamMembers,
  teams,
  users,
} from "@/lib/db/schema";
import { generateKSUID } from "@/lib/utils";
import { GVisorRuntime } from "../container-runtime";
import { getLimaServerConnection } from "../lima-utils";
import { NetworkManager } from "../network-manager";
import {
  generatePinacleConfigFromForm,
  pinacleConfigToJSON,
} from "../pinacle-config";
import { PodManager } from "../pod-manager";
import { PodProvisioningService } from "../pod-provisioning-service";

const execAsync = promisify(exec);

// Integration tests that run against actual Lima VM and database
describe("Pod Orchestration Integration Tests", () => {
  let podManager: PodManager;
  let provisioningService: PodProvisioningService;
  let testPodId: string;
  let testUserId: string;
  let testTeamId: string;
  let testServerId: string;

  beforeAll(async () => {
    // 1. Set up Lima SSH key for authentication
    const limaKeyPath = join(homedir(), ".lima", "_config", "user");
    try {
      const limaKey = readFileSync(limaKeyPath, "utf-8");
      process.env.SSH_PRIVATE_KEY = limaKey;
      console.log("🔑 Loaded Lima SSH key");
    } catch (error) {
      console.error("Failed to load Lima SSH key:", error);
      throw error;
    }

    // 2. Check if Lima VM is running and get SSH port
    let sshPort: number;
    const vmName = "gvisor-alpine";

    try {
      const { isLimaVmRunning, getLimaSshPort } = await import("../lima-utils");

      const isRunning = await isLimaVmRunning(vmName);
      if (!isRunning) {
        throw new Error(
          `Lima VM ${vmName} is not running. Start it with: limactl start ${vmName}`,
        );
      }

      console.log(`✅ Lima VM ${vmName} is running`);

      // Get actual SSH port from Lima
      sshPort = await getLimaSshPort(vmName);
      console.log(`🔌 Lima SSH port: ${sshPort}`);
    } catch (error) {
      console.error("Lima VM check failed:", error);
      throw error;
    }

    // 3. Clean up existing test data from database
    console.log("🧹 Cleaning up test data from database...");

    // Find test team first (to clean up all related data)
    const [existingTestTeam] = await db
      .select()
      .from(teams)
      .where(eq(teams.name, "Integration Test Team"))
      .limit(1);

    if (existingTestTeam) {
      // Delete all pods belonging to test team
      const teamPods = await db
        .select()
        .from(pods)
        .where(eq(pods.teamId, existingTestTeam.id));

      for (const pod of teamPods) {
        await db.delete(pods).where(eq(pods.id, pod.id));
      }
      console.log(`   Deleted ${teamPods.length} pods from test team`);

      // Delete team
      await db.delete(teams).where(eq(teams.id, existingTestTeam.id));
    }

    // Find and delete test user (will cascade delete team memberships)
    const [existingTestUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, "integration-test@example.com"))
      .limit(1);

    if (existingTestUser) {
      await db.delete(users).where(eq(users.id, existingTestUser.id));
    }

    // 4. Clean up containers and networks
    console.log("🧹 Cleaning up containers and networks...");
    const limaConfig = await getLimaServerConnection();
    podManager = new PodManager(limaConfig);
    const containerRuntime = new GVisorRuntime(limaConfig);

    const containers = await containerRuntime.listContainers();
    const testContainers = containers.filter(
      (p) =>
        p.podId.startsWith("lifecycle-test-") ||
        p.podId.startsWith("test-integration-") ||
        p.podId.startsWith("proxy-test-") ||
        p.podId.startsWith("github-test-") ||
        p.podId.includes("template-test") ||
        p.podId.includes("integration-test"),
    );
    for (const container of testContainers) {
      await containerRuntime.removeContainer(container.id);
    }

    const networkManager = new NetworkManager(limaConfig);
    const networks = await networkManager.listPodNetworks();
    const integrationTestNetworks = networks.filter(
      (n) =>
        n.podId.startsWith("lifecycle-test-") ||
        n.podId.startsWith("test-integration-") ||
        n.podId.startsWith("github-test-") ||
        n.podId.startsWith("proxy-test-") ||
        n.podId.includes("template-test") ||
        n.podId.includes("integration-test"),
    );
    for (const network of integrationTestNetworks) {
      await networkManager.destroyPodNetwork(network.podId);
    }

    // 5. Set up database records for testing
    console.log("📦 Setting up test database records...");

    // Create test user
    const [testUser] = await db
      .insert(users)
      .values({
        email: "integration-test@example.com",
        name: "Integration Test User",
        githubId: "12345",
        githubUsername: "integration-test-user",
      })
      .returning();
    testUserId = testUser.id;

    // Create test team
    const [testTeam] = await db
      .insert(teams)
      .values({
        name: "Integration Test Team",
        slug: "integration-test-team",
        ownerId: testUserId,
      })
      .returning();
    testTeamId = testTeam.id;

    // Add user to team
    await db.insert(teamMembers).values({
      teamId: testTeamId,
      userId: testUserId,
      role: "owner",
    });

    // Create or update test server record for Lima VM with current SSH port
    const [existingServer] = await db
      .select()
      .from(servers)
      .where(eq(servers.hostname, "lima-gvisor-alpine"))
      .limit(1);

    if (existingServer) {
      // Update SSH port and limaVmName to current values
      await db
        .update(servers)
        .set({ sshPort, limaVmName: vmName })
        .where(eq(servers.id, existingServer.id));
      testServerId = existingServer.id;
      console.log(
        `✅ Updated server SSH port: ${existingServer.hostname}:${sshPort}`,
      );
    } else {
      const [testServer] = await db
        .insert(servers)
        .values({
          hostname: "lima-gvisor-alpine",
          ipAddress: "127.0.0.1",
          cpuCores: 4,
          memoryMb: 8192,
          diskGb: 100,
          sshHost: "127.0.0.1",
          sshPort,
          sshUser: process.env.USER || "root",
          limaVmName: vmName, // Mark this as a Lima VM
          status: "online",
        })
        .returning();
      testServerId = testServer.id;
      console.log(`✅ Created test server: ${testServer.hostname}:${sshPort}`);
    }

    provisioningService = new PodProvisioningService();
    testPodId = `integration-test-${Date.now()}`;
  }, 60_000);

  it.skip("should provision a pod from database through the full flow", async () => {
    // 1. Create pod record in database
    console.log("📝 Creating pod record in database...");

    const pinacleConfig = generatePinacleConfigFromForm({
      template: "custom",
      tier: "dev.small",
      customServices: ["claude-code"],
    });

    // Create env set
    const [envSet] = await db
      .insert(envSets)
      .values({
        id: generateKSUID("env_set"),
        name: "Integration Test Env",
        ownerId: testUserId,
        teamId: testTeamId,
        variables: JSON.stringify({ TEST_VAR: "integration-test" }),
      })
      .returning();

    const [podRecord] = await db
      .insert(pods)
      .values({
        id: testPodId,
        name: "Integration Test Pod",
        slug: "integration-test-pod",
        description: "A test pod for integration testing",
        template: "custom",
        teamId: testTeamId,
        ownerId: testUserId,
        config: pinacleConfigToJSON(pinacleConfig),
        envSetId: envSet.id,
        monthlyPrice: 1000, // $10
        status: "creating",
      })
      .returning();

    expect(podRecord.id).toBe(testPodId);
    expect(podRecord.status).toBe("creating");

    // 2. Provision the pod using the service
    console.log("🚀 Provisioning pod through PodProvisioningService...");
    await provisioningService.provisionPod(
      {
        podId: testPodId,
        serverId: testServerId,
      },
      false,
    );

    // 3. Verify pod was updated in database
    const [provisionedPod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, testPodId))
      .limit(1);

    expect(provisionedPod.status).toBe("running");
    expect(provisionedPod.containerId).toBeTruthy();
    expect(provisionedPod.serverId).toBe(testServerId);
    expect(provisionedPod.publicUrl).toBeTruthy();
    expect(provisionedPod.lastStartedAt).toBeTruthy();

    console.log(`✅ Pod provisioned: ${provisionedPod.containerId}`);

    // 4. Verify pod logs were created
    const logs = await provisioningService.getPodLogs(testPodId);
    expect(logs.length).toBeGreaterThan(0);
    console.log(`📋 Found ${logs.length} log entries in database`);

    // 5. Test pod operations using podManager
    console.log("🧪 Testing pod operations...");

    // Execute command in pod
    const execResult = await podManager.execInPod(testPodId, [
      "echo",
      "Hello from pod!",
    ]);
    expect(execResult.exitCode).toBe(0);
    expect(execResult.stdout.trim()).toBe("Hello from pod!");

    // Check environment variable
    const envResult = await podManager.execInPod(testPodId, [
      "printenv",
      "TEST_VAR",
    ]);
    expect(envResult.exitCode).toBe(0);
    expect(envResult.stdout.trim()).toBe("integration-test");

    // 6. Verify server assignment
    const [assignedServer] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, testServerId))
      .limit(1);

    expect(assignedServer.hostname).toBe("lima-gvisor-alpine");

    console.log("✅ Integration test completed successfully!");
    console.log(`   Pod ID: ${testPodId}`);
    console.log(`   Server: ${assignedServer.hostname}`);
    console.log(`   Container: ${provisionedPod.containerId}`);
    console.log(`   Logs: ${logs.length} entries`);
  }, 90000); // 90 second timeout for integration test

  it.skip("should handle pod lifecycle through database", async () => {
    const lifecycleTestId = `lifecycle-test-${Date.now()}`;

    // 1. Create pod in database
    console.log("📝 Creating lifecycle test pod in database...");

    const pinacleConfig = generatePinacleConfigFromForm({
      tier: "dev.small",
      customServices: ["claude-code"],
    });

    await db.insert(pods).values({
      id: lifecycleTestId,
      name: "Lifecycle Test Pod",
      slug: "lifecycle-test-pod",
      teamId: testTeamId,
      ownerId: testUserId,
      config: pinacleConfigToJSON(pinacleConfig),
      monthlyPrice: 500,
      status: "creating",
    });

    // 2. Provision pod
    console.log("🚀 Provisioning lifecycle test pod...");
    await provisioningService.provisionPod(
      {
        podId: lifecycleTestId,
        serverId: testServerId,
      },
      false,
    );

    // 3. Verify pod is running
    let [podRecord] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, lifecycleTestId))
      .limit(1);

    expect(podRecord.status).toBe("running");
    expect(podRecord.containerId).toBeTruthy();

    console.log(`✅ Pod running: ${podRecord.containerId}`);

    // 4. Update pod status to stopped (simulating stop operation)
    console.log("⏸️  Stopping pod...");
    await podManager.stopPod(lifecycleTestId);

    let pod = await podManager.getPod(lifecycleTestId);
    expect(pod?.status).toBe("stopped");

    // Update database
    await db
      .update(pods)
      .set({
        status: "stopped",
        lastStoppedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pods.id, lifecycleTestId));

    // 5. Restart pod
    console.log("▶️  Restarting pod...");
    await podManager.startPod(lifecycleTestId);

    pod = await podManager.getPod(lifecycleTestId);
    expect(pod?.status).toBe("running");

    // Update database
    await db
      .update(pods)
      .set({
        status: "running",
        lastStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pods.id, lifecycleTestId));

    [podRecord] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, lifecycleTestId))
      .limit(1);

    expect(podRecord.status).toBe("running");

    // 6. Delete pod
    console.log("🗑️  Deleting pod...");
    await podManager.deletePod(lifecycleTestId);

    pod = await podManager.getPod(lifecycleTestId);
    expect(pod).toBeNull();

    // Delete from database
    await db.delete(pods).where(eq(pods.id, lifecycleTestId));

    const [deletedPod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, lifecycleTestId))
      .limit(1);

    expect(deletedPod).toBeUndefined();

    console.log("✅ Lifecycle test completed successfully!");
  }, 120000); // 2 minute timeout

  it.skip("should list and filter pods from database", async () => {
    const listTestId1 = `list-test-1-${Date.now()}`;
    const listTestId2 = `list-test-2-${Date.now()}`;

    // 1. Create test pods in database
    console.log("📝 Creating test pods in database...");

    const config1 = generatePinacleConfigFromForm({
      template: "nextjs",
      tier: "dev.small",
      customServices: ["claude-code"],
    });

    const config2 = generatePinacleConfigFromForm({
      template: "custom",
      tier: "dev.small",
      customServices: ["claude-code"],
    });

    await db.insert(pods).values([
      {
        id: listTestId1,
        name: "List Test Pod 1",
        slug: "list-test-pod-1",
        template: "nextjs",
        teamId: testTeamId,
        ownerId: testUserId,
        config: pinacleConfigToJSON(config1),
        monthlyPrice: 500,
        status: "creating",
      },
      {
        id: listTestId2,
        name: "List Test Pod 2",
        slug: "list-test-pod-2",
        template: "custom",
        teamId: testTeamId,
        ownerId: testUserId,
        config: pinacleConfigToJSON(config2),
        monthlyPrice: 500,
        status: "creating",
      },
    ]);

    // 2. Provision both pods
    console.log("🚀 Provisioning test pods...");
    await provisioningService.provisionPod(
      {
        podId: listTestId1,
        serverId: testServerId,
      },
      false,
    );
    await provisioningService.provisionPod(
      {
        podId: listTestId2,
        serverId: testServerId,
      },
      false,
    );

    // 3. Verify pods in database
    const dbPods = await db
      .select()
      .from(pods)
      .where(eq(pods.teamId, testTeamId));

    expect(dbPods.length).toBeGreaterThanOrEqual(2);

    // 4. Filter by status
    const runningPods = dbPods.filter((p) => p.status === "running");
    const testPods = runningPods.filter(
      (p) => p.id === listTestId1 || p.id === listTestId2,
    );
    expect(testPods).toHaveLength(2);

    // 5. Filter by template
    const nextjsPods = dbPods.filter((p) => p.template === "nextjs");
    const nextjsTestPods = nextjsPods.filter((p) => p.id === listTestId1);
    expect(nextjsTestPods).toHaveLength(1);

    // 6. Verify using podManager (for in-memory state)
    const allPods = await podManager.listPods();
    expect(allPods.length).toBeGreaterThanOrEqual(2);

    console.log("✅ List and filter test completed successfully!");
    console.log(`   Database pods: ${dbPods.length}`);
    console.log(`   PodManager pods: ${allPods.length}`);
  }, 180000); // 3 minute timeout

  it("should provision template-based pod from database", async () => {
    const templateTestId = `template-test-${Date.now()}`;

    // 1. Create pod with template in database
    console.log("📝 Creating template-based pod in database...");

    const pinacleConfig = generatePinacleConfigFromForm({
      template: "nextjs",
      tier: "dev.small",
      customServices: ["claude-code", "code-server"],
    });

    // Create env set
    const [templateEnvSet] = await db
      .insert(envSets)
      .values({
        id: generateKSUID("env_set"),
        name: "Template Test Env",
        ownerId: testUserId,
        teamId: testTeamId,
        variables: JSON.stringify({
          CUSTOM_VAR: "template-test",
          NODE_ENV: "development",
        }),
      })
      .returning();

    await db.insert(pods).values({
      id: templateTestId,
      name: "Template Test Pod",
      slug: "template-test-pod",
      template: "nextjs",
      teamId: testTeamId,
      ownerId: testUserId,
      config: pinacleConfigToJSON(pinacleConfig),
      envSetId: templateEnvSet.id,
      monthlyPrice: 1000,
      status: "creating",
    });

    // 2. Provision pod using the service
    console.log("🚀 Provisioning template-based pod...");
    await provisioningService.provisionPod(
      {
        podId: templateTestId,
        serverId: testServerId,
      },
      false,
    );

    // 3. Verify pod in database
    const [provisionedPod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, templateTestId))
      .limit(1);

    expect(provisionedPod.status).toBe("running");
    expect(provisionedPod.template).toBe("nextjs");
    expect(provisionedPod.containerId).toBeTruthy();

    console.log(`✅ Template pod provisioned: ${provisionedPod.containerId}`);

    // 4. Verify template-specific configuration
    const envResult = await podManager.execInPod(templateTestId, [
      "printenv",
      "NODE_ENV",
    ]);
    expect(envResult.exitCode).toBe(0);
    expect(envResult.stdout.trim()).toBe("development");

    const customVarResult = await podManager.execInPod(templateTestId, [
      "printenv",
      "CUSTOM_VAR",
    ]);
    expect(customVarResult.exitCode).toBe(0);
    expect(customVarResult.stdout.trim()).toBe("template-test");

    // 5. Verify logs in database
    const logs = await provisioningService.getPodLogs(templateTestId);
    expect(logs.length).toBeGreaterThan(0);

    console.log("✅ Template test completed successfully!");
    console.log(`   Template: nextjs`);
    console.log(`   Logs: ${logs.length} entries`);
  }, 120000);

  it("should provision pod with hostname-based Nginx proxy from database", async () => {
    const proxyTestId = `proxy-test-${Date.now()}`;

    // 1. Create pod in database
    console.log("📝 Creating proxy test pod in database...");

    const pinacleConfig = generatePinacleConfigFromForm({
      template: "custom",
      tier: "dev.small",
      customServices: ["claude-code"],
    });

    // Create env set
    const [proxyEnvSet] = await db
      .insert(envSets)
      .values({
        id: generateKSUID("env_set"),
        name: "Proxy Test Env",
        ownerId: testUserId,
        teamId: testTeamId,
        variables: JSON.stringify({ TEST_ENV: "hostname-routing" }),
      })
      .returning();

    await db.insert(pods).values({
      id: proxyTestId,
      name: "Proxy Test Pod",
      slug: "proxy-test-pod",
      template: "custom",
      teamId: testTeamId,
      ownerId: testUserId,
      config: pinacleConfigToJSON(pinacleConfig),
      envSetId: proxyEnvSet.id,
      monthlyPrice: 1000,
      status: "creating",
    });

    // 2. Provision pod
    console.log("🚀 Provisioning pod with Nginx proxy...");
    await provisioningService.provisionPod(
      {
        podId: proxyTestId,
        serverId: testServerId,
      },
      false,
    );

    // 3. Verify pod and get port information
    const [provisionedPod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, proxyTestId))
      .limit(1);

    expect(provisionedPod.status).toBe("running");
    expect(provisionedPod.ports).toBeTruthy();

    const ports = JSON.parse(provisionedPod.ports!);
    expect(ports).toHaveLength(1);
    expect(ports[0].name).toBe("nginx-proxy");
    expect(ports[0].internal).toBe(80);
    expect(ports[0].external).toBeGreaterThanOrEqual(30000);

    const proxyPort = ports[0].external;
    console.log(`✅ Nginx proxy exposed on port ${proxyPort}`);

    // Wait for container to be fully ready
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check that Nginx is running
    const nginxCheck = await podManager.execInPod(proxyTestId, [
      "rc-service",
      "nginx",
      "status",
    ]);
    console.log("Nginx status:", nginxCheck.stdout);

    // Start a simple HTTP server on port 3000 inside the container
    console.log("Starting test HTTP server on port 3000...");
    await podManager.execInPod(proxyTestId, [
      "sh",
      "-c",
      "mkdir -p /tmp/test-server && echo 'Hello from port 3000!' > /tmp/test-server/index.html",
    ]);

    // Start Python HTTP server in the background (using nohup)
    await podManager.execInPod(proxyTestId, [
      "sh",
      "-c",
      "cd /tmp/test-server && nohup python3 -m http.server 3000 > /tmp/server-3000.log 2>&1 &",
    ]);

    // Start another server on port 8080
    console.log("Starting test HTTP server on port 8080...");
    await podManager.execInPod(proxyTestId, [
      "sh",
      "-c",
      "mkdir -p /tmp/test-server-8080 && echo 'Hello from port 8080!' > /tmp/test-server-8080/index.html",
    ]);

    await podManager.execInPod(proxyTestId, [
      "sh",
      "-c",
      "cd /tmp/test-server-8080 && nohup python3 -m http.server 8080 > /tmp/server-8080.log 2>&1 &",
    ]);

    // Wait for servers to start
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Test that we can access the servers via Nginx proxy from inside the container
    console.log("Testing Nginx proxy from inside container...");

    // Test port 3000 via hostname routing from inside container
    const test3000 = await podManager.execInPod(proxyTestId, [
      "wget",
      "-O-",
      "-q",
      "--header=Host: localhost-3000.pod-proxy-test-pod.pinacle.dev",
      "http://localhost:80",
    ]);
    console.log("Port 3000 response (from container):", test3000.stdout);
    expect(test3000.stdout.trim()).toBe("Hello from port 3000!");

    // Test port 8080 via hostname routing from inside container
    const test8080 = await podManager.execInPod(proxyTestId, [
      "wget",
      "-O-",
      "-q",
      "--header=Host: localhost-8080.pod-proxy-test-pod.pinacle.dev",
      "http://localhost:80",
    ]);
    console.log("Port 8080 response (from container):", test8080.stdout);
    expect(test8080.stdout.trim()).toBe("Hello from port 8080!");

    // Test from Mac using curl (this tests the full Lima port forwarding + hostname routing)
    console.log("Testing from Mac via curl...");
    const curlTest3000 = await execAsync(
      `curl -s -H "Host: localhost-3000.pod-proxy-test-pod.localhost" http://localhost:${proxyPort}`,
    );
    console.log("Port 3000 response (from Mac):", curlTest3000.stdout.trim());
    expect(curlTest3000.stdout.trim()).toBe("Hello from port 3000!");

    const curlTest8080 = await execAsync(
      `curl -s -H "Host: localhost-8080.pod-proxy-test-pod.localhost" http://localhost:${proxyPort}`,
    );
    console.log("Port 8080 response (from Mac):", curlTest8080.stdout.trim());
    expect(curlTest8080.stdout.trim()).toBe("Hello from port 8080!");

    console.log("✅ Hostname-based routing test completed successfully!");
    console.log(`📝 Access these services from your Mac/browser at:`);
    console.log(
      `   http://localhost-3000.pod-${provisionedPod.slug}.localhost:${proxyPort}`,
    );
    console.log(
      `   http://localhost-8080.pod-${provisionedPod.slug}.localhost:${proxyPort}`,
    );
  }, 120000); // 2 minute timeout

  it.only("should provision pod with GitHub repository from database", async () => {
    const githubTestId = `github-test-${Date.now()}`;
    const testRepo = "https://github.com/octocat/Hello-World.git";

    console.log("📝 Creating pod with GitHub repository in database...");

    // 1. Generate SSH key pair
    const { GitHubIntegration } = await import("../github-integration");
    const githubIntegration = new GitHubIntegration(podManager);
    const sshKeyPair = await githubIntegration.generateSSHKeyPair(githubTestId);

    console.log("✅ Generated SSH key pair");
    console.log(`   Fingerprint: ${sshKeyPair.fingerprint}`);

    // 2. Create pod in database with GitHub repo
    const pinacleConfig = generatePinacleConfigFromForm({
      template: "nodejs-blank",
      tier: "dev.small",
      customServices: ["claude-code"],
    });

    // Create env set
    const [githubEnvSet] = await db
      .insert(envSets)
      .values({
        id: generateKSUID("env_set"),
        name: "GitHub Test Env",
        ownerId: testUserId,
        teamId: testTeamId,
        variables: JSON.stringify({ NODE_ENV: "development" }),
      })
      .returning();

    await db.insert(pods).values({
      id: githubTestId,
      name: "GitHub Integration Test Pod",
      slug: "github-test-pod",
      template: "nodejs-blank",
      teamId: testTeamId,
      ownerId: testUserId,
      githubRepo: testRepo,
      config: pinacleConfigToJSON(pinacleConfig),
      envSetId: githubEnvSet.id,
      monthlyPrice: 1000,
      status: "creating",
    });

    // 3. Provision pod with GitHub repo setup
    console.log(`🚀 Provisioning pod with repository: ${testRepo}`);
    await provisioningService.provisionPod(
      {
        podId: githubTestId,
        serverId: testServerId,
        githubRepoSetup: {
          type: "existing",
          repository: testRepo,
          sshKeyPair: sshKeyPair,
        },
      },
      false,
    );

    // 4. Verify pod in database
    const [provisionedPod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, githubTestId))
      .limit(1);

    expect(provisionedPod.status).toBe("running");
    expect(provisionedPod.containerId).toBeTruthy();
    expect(provisionedPod.githubRepo).toBe(testRepo);

    console.log("✅ Pod created and running");

    // 5. Verify the repository was cloned correctly
    console.log("🔍 Verifying cloned repository...");

    const serverConnection = await getLimaServerConnection();
    const containerRuntime = new GVisorRuntime(serverConnection);
    const { stdout: repoCheck } = await containerRuntime.execCommand(
      provisionedPod.containerId!,
      ["sh", "-c", "'cd /workspace/Hello-World && git remote -v && ls -la'"],
    );

    console.log("Repository check:", repoCheck);
    expect(repoCheck).toContain("origin");
    expect(repoCheck).toContain("github.com");
    expect(repoCheck).toContain("README");

    // 6. Check that we can read a file from the repo
    const { stdout: readmeContent } = await containerRuntime.execCommand(
      provisionedPod.containerId!,
      ["sh", "-c", "'cat /workspace/Hello-World/README'"],
    );

    console.log(
      "📄 README.md preview:",
      `${readmeContent.substring(0, 100)}...`,
    );
    expect(readmeContent.length).toBeGreaterThan(0);

    // 7. Verify git configuration
    const { stdout: gitConfig } = await containerRuntime.execCommand(
      provisionedPod.containerId!,
      [
        "sh",
        "-c",
        "'cd /workspace/Hello-World && git config --list | grep remote'",
      ],
    );

    expect(gitConfig).toContain("remote.origin.url");

    // 8. Verify logs in database
    const logs = await provisioningService.getPodLogs(githubTestId);
    expect(logs.length).toBeGreaterThan(0);

    console.log(
      "✅ GitHub repository integration test completed successfully!",
    );
    console.log(`   Repository: ${testRepo}`);
    console.log(`   Location: /workspace/Hello-World`);
    console.log(`   Files found: ${repoCheck.split("\n").length} items`);
    console.log(`   Logs: ${logs.length} entries`);
  }, 180000); // 3 minute timeout

  it("should properly clean up container when deleting pod", async () => {
    console.log("\n🧪 Testing pod deletion with container cleanup...");

    // 1. Create and provision a test pod
    const deleteTestId = `delete-test-${Date.now()}`;
    console.log(`📦 Creating pod ${deleteTestId} for deletion test...`);

    const pinacleConfig = generatePinacleConfigFromForm({
      template: "nodejs-blank",
      tier: "dev.small",
      customServices: ["web-terminal"],
    });

    await db
      .insert(pods)
      .values({
        id: deleteTestId,
        name: "Delete Test Pod",
        slug: "delete-test-pod",
        description: "Test pod for testing deletion",
        template: "nodejs-blank",
        teamId: testTeamId,
        ownerId: testUserId,
        config: pinacleConfigToJSON(pinacleConfig),
        monthlyPrice: 500,
        status: "creating",
      })
      .returning();

    // Provision the pod
    console.log("🚀 Provisioning pod...");
    await provisioningService.provisionPod(
      {
        podId: deleteTestId,
        serverId: testServerId,
      },
      false,
    );

    // Verify it was created
    const [provisionedPod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, deleteTestId))
      .limit(1);

    expect(provisionedPod.status).toBe("running");
    expect(provisionedPod.containerId).toBeTruthy();
    const containerId = provisionedPod.containerId!;

    console.log(`✅ Pod provisioned with container: ${containerId}`);

    // Verify container exists
    const serverConnection = await getLimaServerConnection();
    const runtime = new GVisorRuntime(serverConnection);

    const containerBefore = await runtime.getContainer(containerId);
    expect(containerBefore).toBeTruthy();
    expect(containerBefore?.status).toBe("running");

    console.log("✅ Container verified running before deletion");

    // 2. Delete the pod (should clean up container)
    console.log("🗑️  Deleting pod...");
    await podManager.deletePod(deleteTestId);

    // 3. Verify container was removed
    console.log("🔍 Verifying container cleanup...");
    const containerAfter = await runtime.getContainer(containerId);
    expect(containerAfter).toBeNull();

    console.log("✅ Container successfully removed");

    // 4. Verify network was cleaned up
    // Try to inspect the network - it should fail
    try {
      await execAsync(
        `limactl shell gvisor-alpine sudo docker network inspect pinacle-net-${deleteTestId}`,
      );
      // If we get here, network still exists - fail the test
      throw new Error("Network should have been removed but still exists");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // Expect error about network not found
      expect(errorMessage).toContain("No such network");
      console.log("✅ Network successfully removed");
    }

    console.log("✅ Pod deletion test completed successfully!");
  }, 120000); // 2 minute timeout

  it("should deprovision pod using PodProvisioningService", async () => {
    // This tests the full deprovision flow that the tRPC delete mutation uses
    // It abstracts away all server connection details through the service
    console.log(
      "\n🧪 Testing pod deprovisioning through PodProvisioningService...",
    );

    // 1. Create and provision a test pod
    const deprovisionTestId = `deprovision-test-${Date.now()}`;
    console.log(`📦 Creating pod ${deprovisionTestId} for deprovision test...`);

    const pinacleConfig = generatePinacleConfigFromForm({
      template: "nodejs-blank",
      tier: "dev.small",
      customServices: ["web-terminal"],
    });

    await db
      .insert(pods)
      .values({
        id: deprovisionTestId,
        name: "Deprovision Test Pod",
        slug: "deprovision-test-pod",
        description: "Test pod for testing deprovisioning service",
        template: "nodejs-blank",
        teamId: testTeamId,
        ownerId: testUserId,
        config: pinacleConfigToJSON(pinacleConfig),
        monthlyPrice: 500,
        status: "creating",
      })
      .returning();

    // Provision the pod
    console.log("🚀 Provisioning pod...");
    await provisioningService.provisionPod(
      {
        podId: deprovisionTestId,
        serverId: testServerId,
      },
      false,
    );

    // Verify it was created
    const [provisionedPod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, deprovisionTestId))
      .limit(1);

    expect(provisionedPod.status).toBe("running");
    expect(provisionedPod.containerId).toBeTruthy();
    const containerId = provisionedPod.containerId!;

    console.log(`✅ Pod provisioned with container: ${containerId}`);

    // Verify container exists (directly check Docker)
    const serverConnection = await getLimaServerConnection();
    const runtime = new GVisorRuntime(serverConnection);

    const containerBefore = await runtime.getContainer(containerId);
    expect(containerBefore).toBeTruthy();
    expect(containerBefore?.status).toBe("running");

    console.log("✅ Container verified running before deprovisioning");

    // 2. Deprovision using the service (same as tRPC delete mutation)
    console.log("🗑️  Deprovisioning pod through service...");
    await provisioningService.deprovisionPod({ podId: deprovisionTestId });

    // 3. Verify container was removed
    console.log("🔍 Verifying container cleanup...");
    const containerAfter = await runtime.getContainer(containerId);
    expect(containerAfter).toBeNull();

    console.log("✅ Container successfully removed");

    // 4. Verify network was cleaned up
    try {
      await execAsync(
        `limactl shell gvisor-alpine sudo docker network inspect pinacle-net-${deprovisionTestId}`,
      );
      throw new Error("Network should have been removed but still exists");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      expect(errorMessage).toContain("No such network");
      console.log("✅ Network successfully removed");
    }

    // 5. Clean up database record
    await db.delete(pods).where(eq(pods.id, deprovisionTestId));

    console.log("✅ Pod deprovisioning service test completed successfully!");
  }, 120000); // 2 minute timeout
});
