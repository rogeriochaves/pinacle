/**
 * End-to-End Integration Tests for Pod Creation
 *
 * Tests the full flow from tRPC endpoint to pod provisioning
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
import { getLimaSshPort, isLimaVmRunning } from "@/lib/pod-orchestration/lima-utils";
import { appRouter } from "../../root";

// Helper to create tRPC context
const createTestContext = (userId: string) => ({
  session: {
    user: {
      id: userId,
      email: "test@example.com",
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
  },
  db,
  req: undefined as Request | undefined,
});

describe("Pod E2E Integration Tests", () => {
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
    const vmName = "gvisor-alpine";
    const running = await isLimaVmRunning(vmName);
    if (!running) {
      throw new Error(
        `Lima VM ${vmName} is not running. Start it with: limactl start ${vmName}`,
      );
    }

    const sshPort = await getLimaSshPort(vmName);
    console.log(`✅ Lima VM ${vmName} is running on port ${sshPort}`);

    // 3. Clean up existing test data
    console.log("🧹 Cleaning up test data from database...");

    // Clean up old test servers and their pods first
    const oldServers = await db
      .select()
      .from(servers)
      .where(eq(servers.hostname, "test-server"));

    for (const server of oldServers) {
      // Delete pods on this server first
      const serverPods = await db
        .select()
        .from(pods)
        .where(eq(pods.serverId, server.id));

      for (const pod of serverPods) {
        const envSetId = pod.envSetId;
        // Delete pod first (to release foreign key)
        await db.delete(pods).where(eq(pods.id, pod.id));
        // Then delete associated env set
        if (envSetId) {
          await db.delete(envSets).where(eq(envSets.id, envSetId));
        }
      }

      await db.delete(servers).where(eq(servers.id, server.id));
      console.log(`   Deleted old test server: ${server.id}`);
    }

    const [existingTestTeam] = await db
      .select()
      .from(teams)
      .where(eq(teams.name, "E2E Test Team"))
      .limit(1);

    if (existingTestTeam) {
      // Delete all pods, env sets belonging to test team
      const teamPods = await db
        .select()
        .from(pods)
        .where(eq(pods.teamId, existingTestTeam.id));

      for (const pod of teamPods) {
        // Delete associated env set
        if (pod.envSetId) {
          await db.delete(envSets).where(eq(envSets.id, pod.envSetId));
        }
        await db.delete(pods).where(eq(pods.id, pod.id));
      }

      // Delete team
      await db.delete(teams).where(eq(teams.id, existingTestTeam.id));
    }

    const [existingTestUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, "e2e-test@example.com"))
      .limit(1);

    if (existingTestUser) {
      await db.delete(users).where(eq(users.id, existingTestUser.id));
    }

    // 4. Set up database records for testing
    console.log("📦 Setting up test database records...");

    // Create test user
    const [testUser] = await db
      .insert(users)
      .values({
        email: "e2e-test@example.com",
        name: "E2E Test User",
        githubId: "e2e-12345",
        githubUsername: "e2e-test-user",
      })
      .returning();
    testUserId = testUser.id;

    // Create test team
    const [testTeam] = await db
      .insert(teams)
      .values({
        name: "E2E Test Team",
        slug: "e2e-test-team",
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

    // Create or update test server record for Lima VM
    const [existingServer] = await db
      .select()
      .from(servers)
      .where(eq(servers.hostname, "lima-gvisor-alpine-e2e"))
      .limit(1);

    if (existingServer) {
      await db
        .update(servers)
        .set({ sshPort, limaVmName: vmName, status: "online" })
        .where(eq(servers.id, existingServer.id));
      testServerId = existingServer.id;
    } else {
      const [testServer] = await db
        .insert(servers)
        .values({
          hostname: "lima-gvisor-alpine-e2e",
          ipAddress: "127.0.0.1",
          cpuCores: 4,
          memoryMb: 8192,
          diskGb: 100,
          sshHost: "127.0.0.1",
          sshPort,
          sshUser: process.env.USER || "root",
          limaVmName: vmName,
          status: "online",
        })
        .returning();
      testServerId = testServer.id;
    }

    console.log(`✅ Test server ready: ${testServerId}`);
  }, 60_000);

  it("should create pod via tRPC and provision it end-to-end", async () => {
    console.log("🚀 Starting E2E test: pods.create → full provisioning");

    // 1. Create tRPC caller
    const ctx = createTestContext(testUserId);
    const caller = appRouter.createCaller(ctx);

    // 2. Call pods.create
    console.log("📝 Calling pods.create...");
    const pod = await caller.pods.create({
      name: "E2E Test Pod",
      description: "End-to-end integration test pod",
      template: "nodejs-blank",
      teamId: testTeamId,
      tier: "dev.small",
      customServices: ["claude-code"],
      envVars: {
        TEST_VAR: "e2e-test-value",
        NODE_ENV: "test",
      },
    });

    console.log(`✅ Pod created: ${pod.id}`);
    expect(pod.id).toBeTruthy();
    expect(pod.status).toBe("creating");
    expect(pod.name).toBe("E2E Test Pod");

    // 3. Verify env set was created
    expect(pod.envSetId).toBeTruthy();
    const [envSet] = await db
      .select()
      .from(envSets)
      .where(eq(envSets.id, pod.envSetId!))
      .limit(1);

    expect(envSet).toBeTruthy();
    expect(envSet.name).toBe("E2E Test Pod-env");
    const variables = JSON.parse(envSet.variables);
    expect(variables.TEST_VAR).toBe("e2e-test-value");
    expect(variables.NODE_ENV).toBe("test");

    // 4. Poll status until provisioning completes or fails
    console.log("⏳ Waiting for provisioning to complete...");
    const maxWaitTime = 10 * 60 * 1000; // 10 minutes
    const pollInterval = 2000; // 2 seconds
    const startTime = Date.now();

    let finalStatus: string | undefined;
    let statusResult: Awaited<ReturnType<typeof caller.pods.getStatusWithLogs>> | undefined;

    while (Date.now() - startTime < maxWaitTime) {
      // Poll status
      statusResult = await caller.pods.getStatusWithLogs({
        podId: pod.id,
      });

      finalStatus = statusResult.pod.status;
      console.log(`   Status: ${finalStatus} (logs: ${statusResult.logs.length})`);

      // Check if provisioning finished
      if (finalStatus === "running" || finalStatus === "error") {
        break;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // 5. Verify final status
    expect(finalStatus).toBe("running");
    expect(statusResult?.pod.containerId).toBeTruthy();
    expect(statusResult?.pod.lastStartedAt).toBeTruthy();

    console.log(`✅ Pod provisioned successfully!`);
    console.log(`   Container ID: ${statusResult?.pod.containerId}`);
    console.log(`   Total logs: ${statusResult?.logs.length}`);

    // 6. Verify pod record in database
    const [finalPod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, pod.id))
      .limit(1);

    expect(finalPod.status).toBe("running");
    expect(finalPod.containerId).toBeTruthy();
    expect(finalPod.internalIp).toBeTruthy();
    expect(finalPod.lastStartedAt).toBeTruthy();

    console.log("✅ E2E test completed successfully!");
  }, 12 * 60 * 1000); // 12 minute timeout (10 min provision + 2 min buffer)

  it.skip("should retry failed provisioning via tRPC", async () => {
    // This test would require intentionally failing provisioning
    // and then retrying it - skipping for now as it requires
    // more complex setup
  });
});

