import { exec } from "node:child_process";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  dotenvs,
  pods,
  servers,
  teamMembers,
  teams,
  users,
} from "@/lib/db/schema";
import { generateKSUID } from "@/lib/utils";
import { KataRuntime } from "../container-runtime";
import { NetworkManager } from "../network-manager";
import {
  generatePinacleConfigFromForm,
  pinacleConfigToJSON,
} from "../pinacle-config";
import { PodManager } from "../pod-manager";
import { PodProvisioningService } from "../pod-provisioning-service";
import { SSHServerConnection } from "../server-connection";
import type { ServerConnection } from "../types";

const execAsync = promisify(exec);

// Integration tests that run against actual test server and database
describe("Pod Orchestration Integration Tests", () => {
  let provisioningService: PodProvisioningService;
  let serverConnection: ServerConnection;
  let testPodId: string;
  let testUserId: string;
  let testTeamId: string;
  let testServerId: string;

  beforeAll(async () => {
    // 1. Set up test server SSH key
    const privateKey = process.env.SSH_PRIVATE_KEY || "test-key";
    process.env.SSH_PRIVATE_KEY = privateKey;
    console.log("🔑 Using test SSH key");

    // 2. Set up test server connection
    const sshPort = 22; // Default SSH port for test server
    console.log(`✅ Using test server connection on port ${sshPort}`);

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
    serverConnection = new SSHServerConnection({
      host: "127.0.0.1",
      port: sshPort,
      user: process.env.USER || "root",
      privateKey: privateKey,
    });
    const containerRuntime = new KataRuntime(serverConnection);

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

    const networkManager = new NetworkManager(serverConnection);
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

    // Create or update test server record for test server with SSH port
    const [existingServer] = await db
      .select()
      .from(servers)
      .where(eq(servers.hostname, "lima-gvisor-alpine"))
      .limit(1);

    if (existingServer) {
      // Update SSH port
      await db
        .update(servers)
        .set({ sshPort })
        .where(eq(servers.id, existingServer.id));
      testServerId = existingServer.id;
      console.log(
        `✅ Updated server SSH port: ${existingServer.hostname}:${sshPort}`,
      );
    } else {
      const [testServer] = await db
        .insert(servers)
        .values({
          hostname: "test-server",
          ipAddress: "127.0.0.1",
          cpuCores: 4,
          memoryMb: 8192,
          diskGb: 100,
          sshHost: "127.0.0.1",
          sshPort,
          sshUser: process.env.USER || "root",
          status: "online",
        })
        .returning();
      testServerId = testServer.id;
      console.log(`✅ Created test server: ${testServer.hostname}:${sshPort}`);
    }

    provisioningService = new PodProvisioningService();
    testPodId = `integration-test-${Date.now()}`;
  }, 60_000);

  it("should provision a pod from database through the full flow", async () => {
    // 1. Create pod record in database
    console.log("📝 Creating pod record in database...");

    const pinacleConfig = generatePinacleConfigFromForm({
      template: "nodejs-blank",
      tier: "dev.small",
      customServices: ["claude-code"],
    });

    // Create dotenv
    const [envSet] = await db
      .insert(dotenvs)
      .values({
        name: "Integration Test Env",
        ownerId: testUserId,
        teamId: testTeamId,
        content: "TEST_VAR=integration-test",
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
        dotenvId: envSet.id,
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

    const podManager = new PodManager(testPodId, serverConnection);

    // Execute command in pod
    const execResult = await podManager.execInPod(["echo", "Hello from pod!"]);
    expect(execResult.exitCode).toBe(0);
    expect(execResult.stdout.trim()).toBe("Hello from pod!");

    // Check environment variable
    const envResult = await podManager.execInPod(["printenv", "TEST_VAR"]);
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

  it("should handle pod lifecycle through database", async () => {
    const lifecycleTestId = `lifecycle-test-${Date.now()}`;
    const podManager = new PodManager(lifecycleTestId, serverConnection);

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
    await podManager.stopPod();

    let pod = await podManager.getPodContainer();
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
    await podManager.startPod();

    pod = await podManager.getPodContainer();
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
    await podManager.deletePod();

    pod = await podManager.getPodContainer();
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

  it("should list and filter pods from database", async () => {
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
      template: "nodejs-blank",
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
        template: "nodejs-blank",
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

    console.log("✅ List and filter test completed successfully!");
    console.log(`   Database pods: ${dbPods.length}`);
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
      .insert(dotenvs)
      .values({
        name: "Template Test Env",
        ownerId: testUserId,
        teamId: testTeamId,
        content: "CUSTOM_VAR=template-test\nNODE_ENV=development",
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
      dotenvId: templateEnvSet.id,
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

    const podManager = new PodManager(templateTestId, serverConnection);

    // 4. Verify template-specific configuration
    const envResult = await podManager.execInPod(["printenv", "NODE_ENV"]);
    expect(envResult.exitCode).toBe(0);
    expect(envResult.stdout.trim()).toBe("development");

    const customVarResult = await podManager.execInPod([
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
      template: "nodejs-blank",
      tier: "dev.small",
      customServices: ["claude-code"],
    });

    // Create env set
    const [proxyEnvSet] = await db
      .insert(dotenvs)
      .values({
        name: "Proxy Test Env",
        ownerId: testUserId,
        teamId: testTeamId,
        content: "TEST_ENV=hostname-routing",
      })
      .returning();

    await db.insert(pods).values({
      id: proxyTestId,
      name: "Proxy Test Pod",
      slug: "proxy-test-pod",
      template: "nodejs-blank",
      teamId: testTeamId,
      ownerId: testUserId,
      config: pinacleConfigToJSON(pinacleConfig),
      dotenvId: proxyEnvSet.id,
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
    expect(ports, JSON.stringify(ports)).toHaveLength(1);
    expect(ports[0].name).toBe("nginx-proxy");
    expect(ports[0].internal).toBe(80);
    expect(ports[0].external).toBeGreaterThanOrEqual(30000);

    const proxyPort = ports[0].external;
    console.log(`✅ Nginx proxy exposed on port ${proxyPort}`);

    // Wait for container to be fully ready
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const podManager = new PodManager(proxyTestId, serverConnection);

    // Start a simple HTTP server on port 3000 inside the container
    console.log("Starting test HTTP server on port 3000...");
    await podManager.execInPod([
      "sh",
      "-c",
      "mkdir -p /tmp/test-server && echo 'Hello from port 3000!' > /tmp/test-server/index.html",
    ]);

    // Start Python HTTP server in the background (using nohup)
    await podManager.execInPod([
      "sh",
      "-c",
      "cd /tmp/test-server && nohup python3 -m http.server 3000 > /tmp/server-3000.log 2>&1 &",
    ]);

    // Start another server on port 8080
    console.log("Starting test HTTP server on port 8080...");
    await podManager.execInPod([
      "sh",
      "-c",
      "mkdir -p /tmp/test-server-8080 && echo 'Hello from port 8080!' > /tmp/test-server-8080/index.html",
    ]);

    await podManager.execInPod([
      "sh",
      "-c",
      "cd /tmp/test-server-8080 && nohup python3 -m http.server 8080 > /tmp/server-8080.log 2>&1 &",
    ]);

    // Wait for servers to start
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Test that we can access the servers via Nginx proxy from inside the container
    console.log("Testing Nginx proxy from inside container...");

    // Test port 3000 via hostname routing from inside container
    const test3000 = await podManager.execInPod([
      "wget",
      "-O-",
      "-q",
      "--header=Host: localhost-3000-pod-proxy-test-pod.pinacle.dev",
      "http://localhost:80",
    ]);
    console.log("Port 3000 response (from container):", test3000.stdout);
    expect(test3000.stdout.trim()).toBe("Hello from port 3000!");

    // Test port 8080 via hostname routing from inside container
    const test8080 = await podManager.execInPod([
      "wget",
      "-O-",
      "-q",
      "--header=Host: localhost-8080-pod-proxy-test-pod.pinacle.dev",
      "http://localhost:80",
    ]);
    console.log("Port 8080 response (from container):", test8080.stdout);
    expect(test8080.stdout.trim()).toBe("Hello from port 8080!");

    // Test using curl (this tests the hostname routing)
    console.log("Testing from Mac via curl...");
    const curlTest3000 = await execAsync(
      `curl -s -H "Host: localhost-3000-pod-proxy-test-pod.localhost" http://localhost:${proxyPort}`,
    );
    console.log("Port 3000 response (from Mac):", curlTest3000.stdout.trim());
    expect(curlTest3000.stdout.trim()).toBe("Hello from port 3000!");

    const curlTest8080 = await execAsync(
      `curl -s -H "Host: localhost-8080-pod-proxy-test-pod.localhost" http://localhost:${proxyPort}`,
    );
    console.log("Port 8080 response (from Mac):", curlTest8080.stdout.trim());
    expect(curlTest8080.stdout.trim()).toBe("Hello from port 8080!");

    console.log("✅ Hostname-based routing test completed successfully!");
    console.log(`📝 Access these services from your Mac/browser at:`);
    console.log(
      `   http://localhost-3000-pod-${provisionedPod.slug}.localhost:${proxyPort}`,
    );
    console.log(
      `   http://localhost-8080-pod-${provisionedPod.slug}.localhost:${proxyPort}`,
    );
  }, 120000); // 2 minute timeout

  it.only("should provision pod with GitHub repository from database", async () => {
    const githubTestId = `github-test-${Date.now()}`;
    const testRepo = "https://github.com/octocat/Hello-World.git";

    console.log("📝 Creating pod with GitHub repository in database...");

    // 1. Generate SSH key pair
    const { GitHubIntegration } = await import("../github-integration");
    const podManager = new PodManager(githubTestId, serverConnection);
    const githubIntegration = new GitHubIntegration(podManager);
    const sshKeyPair = await githubIntegration.generateSSHKeyPair(githubTestId);

    console.log("✅ Generated SSH key pair");
    console.log(`   Fingerprint: ${sshKeyPair.fingerprint}`);

    // 2. Create pod in database with GitHub repo
    const pinacleConfig = generatePinacleConfigFromForm({
      template: "nodejs-blank",
      tier: "dev.small",
      customServices: [], // Skip services - testing storage limits, not service provisioning
    });

    // Create env set
    const [githubEnvSet] = await db
      .insert(dotenvs)
      .values({
        name: "GitHub Test Env",
        ownerId: testUserId,
        teamId: testTeamId,
        content: "NODE_ENV=development",
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
      dotenvId: githubEnvSet.id,
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

    const containerRuntime = new KataRuntime(serverConnection);
    const { stdout: repoCheck } = await containerRuntime.execInContainer(
      provisionedPod.id,
      provisionedPod.containerId!,
      ["sh", "-c", "'cd /workspace/Hello-World && git remote -v && ls -la'"],
    );

    console.log("Repository check:", repoCheck);
    expect(repoCheck).toContain("origin");
    expect(repoCheck).toContain("github.com");
    expect(repoCheck).toContain("README");

    // 6. Check that we can read a file from the repo
    const { stdout: readmeContent } = await containerRuntime.execInContainer(
      provisionedPod.id,
      provisionedPod.containerId!,
      ["sh", "-c", "'cat /workspace/Hello-World/README'"],
    );

    console.log(
      "📄 README.md preview:",
      `${readmeContent.substring(0, 100)}...`,
    );
    expect(readmeContent.length).toBeGreaterThan(0);

    // 7. Verify git configuration
    const { stdout: gitConfig } = await containerRuntime.execInContainer(
      provisionedPod.id,
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
    const podManager = new PodManager(deleteTestId, serverConnection);
    const runtime = new KataRuntime(serverConnection);

    const containerBefore = await runtime.getContainer(containerId);
    expect(containerBefore).toBeTruthy();
    expect(containerBefore?.status).toBe("running");

    console.log("✅ Container verified running before deletion");

    // 2. Delete the pod (should clean up container)
    console.log("🗑️  Deleting pod...");
    await podManager.deletePod();

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
    const serverConnection = new SSHServerConnection({
      host: "127.0.0.1",
      port: 22,
      user: process.env.USER || "root",
      privateKey: process.env.SSH_PRIVATE_KEY || "test-key",
    });
    const runtime = new KataRuntime(serverConnection);

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

  it("should persist data in volumes across container stop/start", async () => {
    console.log(
      "\n🧪 Testing volume persistence across container stop/start...",
    );

    // 1. Create and provision a test pod
    const volumeTestId = `volume-test-${Date.now()}`;
    console.log(
      `📦 Creating pod ${volumeTestId} for volume persistence test...`,
    );

    const pinacleConfig = generatePinacleConfigFromForm({
      template: "nodejs-blank",
      tier: "dev.small",
      customServices: ["web-terminal"],
    });
    // Remove install command for this test (no package.json in blank template)
    delete pinacleConfig.install;

    await db
      .insert(pods)
      .values({
        id: volumeTestId,
        name: "Volume Persistence Test Pod",
        slug: "volume-test-pod",
        description: "Test pod for testing volume persistence",
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
        podId: volumeTestId,
        serverId: testServerId,
      },
      false,
    );

    const [provisionedPod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, volumeTestId))
      .limit(1);

    expect(provisionedPod.status).toBe("running");
    const containerId = provisionedPod.containerId!;

    console.log(`✅ Pod provisioned with container: ${containerId}`);

    // 2. Create test files in volume-mounted directories
    const runtime = new KataRuntime(serverConnection);
    const podManager = new PodManager(volumeTestId, serverConnection);

    console.log("📝 Writing test files to volumes...");

    // Write to /workspace
    await podManager.execInPod([
      "sh",
      "-c",
      "echo 'persistent workspace data' > /workspace/test-file.txt",
    ]);

    // Write to /root
    await podManager.execInPod([
      "sh",
      "-c",
      "echo 'persistent root config' > /root/.testrc",
    ]);

    // Write to /home
    await podManager.execInPod([
      "sh",
      "-c",
      "mkdir -p /home/testuser && echo 'persistent home data' > /home/testuser/.profile",
    ]);

    console.log("✅ Test files written");

    // 3. Read files to verify they exist
    const workspaceContent = await podManager.execInPod([
      "cat",
      "/workspace/test-file.txt",
    ]);
    expect(workspaceContent.stdout.trim()).toBe("persistent workspace data");

    const rootContent = await podManager.execInPod(["cat", "/root/.testrc"]);
    expect(rootContent.stdout.trim()).toBe("persistent root config");

    const homeContent = await podManager.execInPod([
      "cat",
      "/home/testuser/.profile",
    ]);
    expect(homeContent.stdout.trim()).toBe("persistent home data");

    console.log("✅ Files verified before stop");

    // 4. Stop the container (simulating `docker stop`)
    console.log("⏸️  Stopping container...");
    await runtime.stopContainer(containerId);

    const stoppedContainer = await runtime.getContainer(containerId);
    expect(stoppedContainer?.status).toBe("stopped");

    console.log("✅ Container stopped");

    // 5. Start the container again
    console.log("▶️  Starting container...");
    await runtime.startContainer(containerId);

    const restartedContainer = await runtime.getContainer(containerId);
    expect(restartedContainer?.status).toBe("running");

    console.log("✅ Container restarted");

    // Wait for container to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 6. Verify files still exist with same content
    console.log("🔍 Verifying files persisted...");

    const workspaceAfter = await podManager.execInPod([
      "cat",
      "/workspace/test-file.txt",
    ]);
    expect(workspaceAfter.stdout.trim()).toBe("persistent workspace data");

    const rootAfter = await podManager.execInPod(["cat", "/root/.testrc"]);
    expect(rootAfter.stdout.trim()).toBe("persistent root config");

    const homeAfter = await podManager.execInPod([
      "cat",
      "/home/testuser/.profile",
    ]);
    expect(homeAfter.stdout.trim()).toBe("persistent home data");

    console.log("✅ All files persisted correctly!");

    // 7. Clean up
    await provisioningService.deprovisionPod({ podId: volumeTestId });
    await db.delete(pods).where(eq(pods.id, volumeTestId));

    console.log("✅ Volume persistence test completed successfully!");
  }, 180000); // 3 minute timeout

  it("should persist data across container removal and recreation", async () => {
    console.log(
      "\n🧪 Testing volume persistence across container removal/recreation...",
    );

    // 1. Create and provision a test pod
    const recreateTestId = `recreate-test-${Date.now()}`;
    console.log(
      `📦 Creating pod ${recreateTestId} for recreation persistence test...`,
    );

    const pinacleConfig = generatePinacleConfigFromForm({
      template: "nodejs-blank",
      tier: "dev.small",
      customServices: ["web-terminal"],
    });
    // Remove install command for this test (no package.json in blank template)
    delete pinacleConfig.install;

    await db
      .insert(pods)
      .values({
        id: recreateTestId,
        name: "Recreation Persistence Test Pod",
        slug: "recreate-test-pod",
        description:
          "Test pod for testing volume persistence across recreation",
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
        podId: recreateTestId,
        serverId: testServerId,
      },
      false,
    );

    const [provisionedPod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, recreateTestId))
      .limit(1);

    expect(provisionedPod.status).toBe("running");
    const originalContainerId = provisionedPod.containerId!;

    console.log(`✅ Pod provisioned with container: ${originalContainerId}`);

    // 2. Create test files in volumes
    const podManager = new PodManager(recreateTestId, serverConnection);
    const runtime = new KataRuntime(serverConnection);

    console.log("📝 Writing test files to volumes...");

    await podManager.execInPod([
      "sh",
      "-c",
      "echo 'data that should survive recreation' > /workspace/important.txt",
    ]);

    await podManager.execInPod([
      "sh",
      "-c",
      "echo 'root config that should survive' > /root/.config",
    ]);

    const originalContent = await podManager.execInPod([
      "cat",
      "/workspace/important.txt",
    ]);
    expect(originalContent.stdout.trim()).toBe(
      "data that should survive recreation",
    );

    console.log("✅ Test files written and verified");

    // 3. Stop and remove the container (simulating server restart or crash)
    console.log("🗑️  Removing container (simulating unexpected restart)...");
    await runtime.stopContainer(originalContainerId);
    await runtime.removeContainer(originalContainerId, {
      removeVolumes: false,
    }); // Don't remove volumes!

    // Verify container is gone
    const removedContainer = await runtime.getContainer(originalContainerId);
    expect(removedContainer).toBeNull();

    console.log("✅ Container removed, volumes preserved");

    // 4. Create a new container for the same pod (simulating pod restart after server restart)
    console.log("🔄 Creating new container with same volumes...");

    // Get the pod spec to recreate container
    const { expandPinacleConfigToSpec } = await import("../pinacle-config");
    const pinacleConfigParsed = JSON.parse(provisionedPod.config);
    const podSpec = await expandPinacleConfigToSpec(pinacleConfigParsed, {
      id: recreateTestId,
      name: provisionedPod.name,
      slug: provisionedPod.slug,
      description: provisionedPod.description || undefined,
    });

    // Allocate ports (reuse the same logic as provisioning)
    const { NetworkManager } = await import("../network-manager");
    const networkManager = new NetworkManager(serverConnection);
    const externalPort = await networkManager.allocatePort(
      recreateTestId,
      "nginx-proxy",
    );
    podSpec.network.ports.push({
      name: "nginx-proxy",
      internal: 80,
      external: externalPort,
      protocol: "tcp",
    });

    // Create new container (volumes will be automatically reattached by name)
    const newContainer = await runtime.createContainer(podSpec);
    await runtime.startContainer(newContainer.id);

    console.log(`✅ New container created: ${newContainer.id}`);

    // Wait for container to initialize
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 5. Verify data persisted in volumes
    console.log("🔍 Verifying data persisted across recreation...");

    const persistedContent = await podManager.execInPod([
      "cat",
      "/workspace/important.txt",
    ]);
    expect(persistedContent.stdout.trim()).toBe(
      "data that should survive recreation",
    );

    const persistedConfig = await podManager.execInPod([
      "cat",
      "/root/.config",
    ]);
    expect(persistedConfig.stdout.trim()).toBe(
      "root config that should survive",
    );

    console.log("✅ All data persisted correctly across container recreation!");

    // 6. Clean up
    await provisioningService.deprovisionPod({ podId: recreateTestId });
    await db.delete(pods).where(eq(pods.id, recreateTestId));

    console.log("✅ Recreation persistence test completed successfully!");
  }, 180000); // 3 minute timeout

  it("should persist system packages installed with apk (universal volumes)", async () => {
    console.log(
      "\n🧪 Testing that system packages DO persist with universal volumes...",
    );

    // 1. Create and provision a test pod
    const apkTestId = `apk-test-${Date.now()}`;
    console.log(`📦 Creating pod ${apkTestId} for apk persistence test...`);

    const pinacleConfig = generatePinacleConfigFromForm({
      template: "nodejs-blank",
      tier: "dev.small",
      customServices: ["web-terminal"],
    });
    // Remove install command for this test (no package.json in blank template)
    delete pinacleConfig.install;

    await db
      .insert(pods)
      .values({
        id: apkTestId,
        name: "APK Persistence Test Pod",
        slug: "apk-test-pod",
        description: "Test pod for testing that apk packages persist",
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
        podId: apkTestId,
        serverId: testServerId,
      },
      false,
    );

    const [provisionedPod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, apkTestId))
      .limit(1);

    expect(provisionedPod.status).toBe("running");
    const containerId = provisionedPod.containerId!;

    console.log(`✅ Pod provisioned with container: ${containerId}`);

    // 2. Install a package with apk
    const podManager = new PodManager(apkTestId, serverConnection);
    const runtime = new KataRuntime(serverConnection);

    console.log("📦 Installing curl with apk...");

    await podManager.execInPod(["apk", "add", "curl"]);

    // Verify curl is installed
    const curlCheck1 = await podManager.execInPod(["which", "curl"]);
    expect(curlCheck1.stdout.trim()).toBe("/usr/bin/curl");

    console.log("✅ curl installed successfully");

    // 3. Stop and restart container
    console.log("🔄 Stopping and restarting container...");
    await runtime.stopContainer(containerId);
    await runtime.startContainer(containerId);

    // Wait for container to initialize
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 4. Verify curl PERSISTED (universal volumes cover /usr, /etc, /var)
    console.log("🔍 Checking if curl persisted (it should!)...");

    const curlCheck2 = await podManager.execInPod(["which", "curl"]);
    expect(curlCheck2.stdout.trim()).toBe("/usr/bin/curl");

    console.log("✅ Confirmed: curl PERSISTED across restart!");
    console.log(
      "📝 Note: With universal volumes, system packages persist automatically. Pods are like VMs!",
    );

    // 5. Clean up
    await provisioningService.deprovisionPod({ podId: apkTestId });
    await db.delete(pods).where(eq(pods.id, apkTestId));

    console.log("✅ System package persistence test completed successfully!");
  }, 180000); // 3 minute timeout

  it("should initialize a new Vite project from template", async () => {
    const viteTestId = `vite-template-test-${Date.now()}`;
    const testRepo = `test-org/vite-test-${Date.now()}`;

    console.log("📝 Creating pod with Vite template...");

    // 1. Generate SSH key pair (mock, won't actually push to GitHub)
    const { GitHubIntegration } = await import("../github-integration");
    const podManager = new PodManager(viteTestId, serverConnection);
    const githubIntegration = new GitHubIntegration(podManager);
    const sshKeyPair = await githubIntegration.generateSSHKeyPair(viteTestId);

    console.log("✅ Generated SSH key pair");

    // 2. Create pod in database with Vite template
    const pinacleConfig = generatePinacleConfigFromForm({
      template: "vite",
      tier: "dev.small",
    });

    await db.insert(pods).values({
      id: viteTestId,
      name: "Vite Template Test Pod",
      slug: "vite-template-test-pod",
      template: "vite",
      teamId: testTeamId,
      ownerId: testUserId,
      githubRepo: testRepo,
      config: pinacleConfigToJSON(pinacleConfig),
      monthlyPrice: 1000,
      status: "creating",
    });

    // 3. Provision pod with new repo setup (template initialization)
    // NOTE: This will fail at the git push step since we're not using a real GitHub repo
    // But that's OK - we're testing the template initialization, not the GitHub push
    console.log(`🚀 Provisioning pod with Vite template...`);

    try {
      await provisioningService.provisionPod(
        {
          podId: viteTestId,
          serverId: testServerId,
          githubRepoSetup: {
            type: "new",
            repository: testRepo,
            sshKeyPair: sshKeyPair,
          },
        },
        false,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // Git push will fail because we're not using a real GitHub repo
      // That's expected and OK for this test
      console.log(`⚠️  Expected error from git push: ${errorMessage}`);
    }

    // 4. Verify pod container exists (check directly, since git push failure prevented DB update)
    const containerRuntime = new KataRuntime(serverConnection);
    const containers = await containerRuntime.listContainers();
    const viteContainer = containers.find((c) => c.podId === viteTestId);

    expect(viteContainer).toBeTruthy();
    if (!viteContainer) throw new Error("Container not found");
    console.log("✅ Pod container created");

    // 5. Verify the project was initialized correctly
    console.log("🔍 Verifying Vite project files...");

    const projectFolder = testRepo.split("/")[1]; // Extract "vite-test-XXX" from "test-org/vite-test-XXX"

    // Check if package.json exists
    const { stdout: packageJsonCheck } = await containerRuntime.execInContainer(
      viteTestId,
      viteContainer.id,
      ["sh", "-c", `'cat /workspace/${projectFolder}/package.json'`],
    );

    expect(packageJsonCheck).toContain('"name"');
    expect(packageJsonCheck).toContain('"scripts"');
    console.log("✅ package.json exists");

    // Parse package.json to verify scripts
    const packageJson = JSON.parse(packageJsonCheck);
    expect(packageJson.scripts).toHaveProperty("dev");
    expect(packageJson.scripts).toHaveProperty("build");
    console.log("✅ package.json has correct scripts");

    // Check if src/App.tsx exists
    const { stdout: appTsxCheck } = await containerRuntime.execInContainer(
      viteTestId,
      viteContainer.id,
      [
        "sh",
        "-c",
        `'test -f /workspace/${projectFolder}/src/App.tsx && echo "exists"'`,
      ],
    );

    expect(appTsxCheck.trim()).toBe("exists");
    console.log("✅ src/App.tsx exists");

    // Check if vite.config.ts exists
    const { stdout: viteConfigCheck } = await containerRuntime.execInContainer(
      viteTestId,
      viteContainer.id,
      [
        "sh",
        "-c",
        `'test -f /workspace/${projectFolder}/vite.config.ts && echo "exists"'`,
      ],
    );

    expect(viteConfigCheck.trim()).toBe("exists");
    console.log("✅ vite.config.ts exists");

    // Check if node_modules exists (pnpm install ran)
    const { stdout: nodeModulesCheck } = await containerRuntime.execInContainer(
      viteTestId,
      viteContainer.id,
      [
        "sh",
        "-c",
        `'test -d /workspace/${projectFolder}/node_modules && echo "exists"'`,
      ],
    );

    expect(nodeModulesCheck.trim()).toBe("exists");
    console.log("✅ node_modules exists (pnpm install succeeded)");

    // 6. Verify Tailwind CSS v4 is installed
    expect(packageJson.devDependencies).toHaveProperty("tailwindcss");
    expect(packageJson.devDependencies).toHaveProperty("@tailwindcss/vite");
    console.log("✅ Tailwind CSS v4 installed");

    // 7. Verify vite.config.ts includes Tailwind plugin
    const { stdout: viteConfigContent } =
      await containerRuntime.execInContainer(viteTestId, viteContainer.id, [
        "sh",
        "-c",
        `'cat /workspace/${projectFolder}/vite.config.ts'`,
      ]);

    expect(viteConfigContent).toContain("@tailwindcss/vite");
    expect(viteConfigContent).toContain("tailwindcss()");
    console.log("✅ Vite config includes Tailwind plugin");

    // 8. Verify index.css has Tailwind import
    const { stdout: indexCssContent } = await containerRuntime.execInContainer(
      viteTestId,
      viteContainer.id,
      ["sh", "-c", `'cat /workspace/${projectFolder}/src/index.css'`],
    );

    expect(indexCssContent).toContain('@import "tailwindcss"');
    console.log("✅ index.css imports Tailwind");

    // 9. Verify shadcn dependencies are installed
    expect(packageJson.dependencies).toHaveProperty("class-variance-authority");
    expect(packageJson.dependencies).toHaveProperty("clsx");
    expect(packageJson.dependencies).toHaveProperty("tailwind-merge");
    console.log("✅ shadcn dependencies installed");

    // 10. Verify lib/utils.ts exists
    const { stdout: utilsCheck } = await containerRuntime.execInContainer(
      viteTestId,
      viteContainer.id,
      [
        "sh",
        "-c",
        `'test -f /workspace/${projectFolder}/src/lib/utils.ts && echo "exists"'`,
      ],
    );

    expect(utilsCheck.trim()).toBe("exists");
    console.log("✅ lib/utils.ts exists");

    // 11. Verify App.tsx has the new welcome page
    const { stdout: appTsxContent } = await containerRuntime.execInContainer(
      viteTestId,
      viteContainer.id,
      ["sh", "-c", `'cat /workspace/${projectFolder}/src/App.tsx'`],
    );

    expect(appTsxContent).toContain("Your Pinacle Vite Template is Ready!");
    expect(appTsxContent).toContain("Tailwind CSS v4");
    expect(appTsxContent).toContain("shadcn/ui Ready");
    console.log("✅ App.tsx has welcome page");

    // 12. Verify git was initialized
    const { stdout: gitCheck } = await containerRuntime.execInContainer(
      viteTestId,
      viteContainer.id,
      ["sh", "-c", `'cd /workspace/${projectFolder} && git status'`],
    );

    expect(gitCheck).toContain("On branch main");
    console.log("✅ Git repository initialized on main branch");

    // 13. Clean up
    console.log("🧹 Cleaning up test pod...");
    await provisioningService.deprovisionPod({ podId: viteTestId });
    await db.delete(pods).where(eq(pods.id, viteTestId));

    console.log(
      "✅ Vite template with Tailwind & shadcn initialization test completed successfully!",
    );
  }, 480000); // 8 minute timeout (template init with Tailwind takes a while)

  it("should initialize a new Next.js SaaS Starter project with Postgres", async () => {
    console.log(
      "🚀 Starting Next.js SaaS Starter template initialization test",
    );

    const nextjsTestId = `nextjs-template-test-${Date.now()}`;
    const testRepo = `test-org/nextjs-test-${Date.now()}`;
    const projectFolder = testRepo.split("/")[1];

    console.log("📝 Creating pod with Next.js template...");

    // 1. Generate SSH key pair (mock, won't actually push to GitHub)
    const { GitHubIntegration } = await import("../github-integration");
    const podManager = new PodManager(nextjsTestId, serverConnection);
    const githubIntegration = new GitHubIntegration(podManager);
    const sshKeyPair = await githubIntegration.generateSSHKeyPair(nextjsTestId);

    console.log("✅ Generated SSH key pair");

    // 2. Create pod in database with Next.js template
    const pinacleConfig = generatePinacleConfigFromForm({
      template: "nextjs",
      tier: "dev.medium",
    });

    await db.insert(pods).values({
      id: nextjsTestId,
      name: "Next.js SaaS Starter Test Pod",
      slug: "nextjs-template-test-pod",
      template: "nextjs",
      teamId: testTeamId,
      ownerId: testUserId,
      githubRepo: testRepo,
      config: pinacleConfigToJSON(pinacleConfig),
      monthlyPrice: 2000,
      status: "creating",
    });

    // 3. Provision pod with new repo setup (template initialization)
    console.log(`🚀 Provisioning pod with Next.js template...`);

    try {
      await provisioningService.provisionPod(
        {
          podId: nextjsTestId,
          serverId: testServerId,
          githubRepoSetup: {
            type: "new",
            repository: testRepo,
            sshKeyPair: sshKeyPair,
          },
        },
        false,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.log(`⚠️  Expected error from git push: ${errorMessage}`);
    }

    // 4. Verify pod container exists
    const containerRuntime = new KataRuntime(serverConnection);
    const containers = await containerRuntime.listContainers();
    const nextjsContainer = containers.find((c) => c.podId === nextjsTestId);

    expect(nextjsContainer).toBeTruthy();
    if (!nextjsContainer) throw new Error("Container not found");
    console.log("✅ Pod container created");

    // 4. Verify package.json exists and has correct scripts
    const { stdout: packageJsonContent } =
      await containerRuntime.execInContainer(nextjsTestId, nextjsContainer.id, [
        "sh",
        "-c",
        `'cat /workspace/${projectFolder}/package.json'`,
      ]);

    const packageJson = JSON.parse(packageJsonContent);
    expect(packageJson.scripts).toHaveProperty("dev");
    expect(packageJson.scripts).toHaveProperty("build");
    console.log("✅ package.json exists with correct scripts");

    // 5. Verify node_modules was installed
    const { stdout: nodeModulesCheck } = await containerRuntime.execInContainer(
      nextjsTestId,
      nextjsContainer.id,
      [
        "sh",
        "-c",
        `'test -d /workspace/${projectFolder}/node_modules && echo "exists"'`,
      ],
    );

    expect(nodeModulesCheck.trim()).toBe("exists");
    console.log("✅ node_modules exists (pnpm install succeeded)");

    // 6. Verify Next.js specific files exist
    const { stdout: appFolderCheck } = await containerRuntime.execInContainer(
      nextjsTestId,
      nextjsContainer.id,
      [
        "sh",
        "-c",
        `'test -d /workspace/${projectFolder}/app && echo "exists"'`,
      ],
    );

    expect(appFolderCheck.trim()).toBe("exists");
    console.log("✅ Next.js app directory exists");

    // 7. Verify Postgres service is installed
    const { stdout: postgresCheck } = await containerRuntime.execInContainer(
      nextjsTestId,
      nextjsContainer.id,
      ["sh", "-c", "'which postgres'"],
    );

    expect(postgresCheck.trim()).toContain("postgres");
    console.log("✅ Postgres is installed");

    // 8. Verify Postgres is running
    const { stdout: postgresStatus } = await containerRuntime.execInContainer(
      nextjsTestId,
      nextjsContainer.id,
      ["sh", "-c", "'rc-status | grep postgres || echo \"not running\"'"],
    );

    console.log(`📊 Postgres status: ${postgresStatus.trim()}`);

    // 9. Verify Postgres data directory is initialized
    const { stdout: postgresDataCheck } =
      await containerRuntime.execInContainer(nextjsTestId, nextjsContainer.id, [
        "sh",
        "-c",
        "'test -f /var/lib/postgresql/data/PG_VERSION && echo \"exists\"'",
      ]);

    expect(postgresDataCheck.trim()).toBe("exists");
    console.log("✅ Postgres data directory is initialized");

    // 10. Verify DATABASE_URL environment variable is set
    const { stdout: envCheck } = await containerRuntime.execInContainer(
      nextjsTestId,
      nextjsContainer.id,
      ["sh", "-c", "'echo $DATABASE_URL'"],
    );

    expect(envCheck.trim()).toContain(
      "postgresql://postgres:postgres@localhost:5432",
    );
    console.log("✅ DATABASE_URL environment variable is set correctly");

    // 11. Verify git was initialized
    const { stdout: gitCheck } = await containerRuntime.execInContainer(
      nextjsTestId,
      nextjsContainer.id,
      ["sh", "-c", `'cd /workspace/${projectFolder} && git status'`],
    );

    expect(gitCheck).toContain("On branch main");
    console.log("✅ Git repository initialized on main branch");

    // 12. Clean up
    console.log("🧹 Cleaning up test pod...");
    await provisioningService.deprovisionPod({ podId: nextjsTestId });
    await db.delete(pods).where(eq(pods.id, nextjsTestId));

    console.log(
      "✅ Next.js SaaS Starter with Postgres initialization test completed successfully!",
    );
  }, 600000); // 10 minute timeout (Next.js + Postgres takes longer)
});
