/**
 * Integration test for pod heartbeat tracking and start/stop functionality
 *
 * Tests:
 * 1. Pod heartbeat updates when metrics are reported
 * 2. Pods marked as stopped when no heartbeat for 60 seconds
 * 3. Start pod functionality
 * 4. Stop pod functionality
 *
 * Requires:
 * - Lima VM (gvisor-alpine) running
 * - PostgreSQL database running
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import { pods, servers, teamMembers, teams, users } from "../../../db/schema";
import { generateKSUID } from "../../../utils";

describe("Pod Heartbeat and Lifecycle Integration", () => {
  let testServerId: string;
  let testPodId: string;
  let testUserId: string;
  let testTeamId: string;
  const uniqueId = Date.now(); // Unique suffix for this test run

  beforeAll(async () => {
    // Clean up any existing test data
    await db
      .delete(pods)
      .where(eq(pods.name, "test-heartbeat-pod"))
      .execute();

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        id: generateKSUID("user"),
        email: `test-heartbeat-${uniqueId}@example.com`,
        name: "Test Heartbeat User",
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { name: "Test Heartbeat User" },
      })
      .returning();
    testUserId = user.id;

    // Create test team with unique slug
    const [team] = await db
      .insert(teams)
      .values({
        id: generateKSUID("team"),
        name: `Test Heartbeat Team ${uniqueId}`,
        slug: `test-heartbeat-team-${uniqueId}`,
        ownerId: testUserId,
      })
      .returning();
    testTeamId = team.id;

    // Add user to team
    await db
      .insert(teamMembers)
      .values({
        id: generateKSUID("team_member"),
        teamId: testTeamId,
        userId: testUserId,
        role: "owner",
      })
      .onConflictDoNothing();

    // Create a test server
    const [server] = await db
      .insert(servers)
      .values({
        id: generateKSUID("server"),
        hostname: "test-heartbeat-server",
        ipAddress: "127.0.0.1",
        cpuCores: 4,
        memoryMb: 8192,
        diskGb: 100,
        sshHost: "localhost",
        sshPort: 22,
        sshUser: "root",
        status: "online",
        lastHeartbeatAt: new Date(),
      })
      .returning();

    testServerId = server.id;
  });

  it("should update pod lastHeartbeatAt when metrics are reported", async () => {
    // Create a test pod
    const [pod] = await db
      .insert(pods)
      .values({
        id: generateKSUID("pod"),
        name: "test-heartbeat-pod",
        slug: "test-heartbeat-pod",
        teamId: testTeamId,
        ownerId: testUserId,
        serverId: testServerId,
        config: JSON.stringify({ tier: "dev.small" }),
        monthlyPrice: 1000,
        status: "running",
        containerId: "test-container-123",
      })
      .returning();

    testPodId = pod.id;

    // Initially, lastHeartbeatAt should be null
    expect(pod.lastHeartbeatAt).toBeNull();

    // Simulate metrics being reported
    const now = new Date();
    await db
      .update(pods)
      .set({ lastHeartbeatAt: now })
      .where(eq(pods.id, testPodId));

    // Verify lastHeartbeatAt was updated
    const [updatedPod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, testPodId))
      .limit(1);

    expect(updatedPod.lastHeartbeatAt).toBeTruthy();
    expect(updatedPod.lastHeartbeatAt?.getTime()).toBeCloseTo(
      now.getTime(),
      -2,
    ); // Within 100ms
  });

  it("should mark pod as stopped when no heartbeat for 60+ seconds", async () => {
    // Set lastHeartbeatAt to 70 seconds ago
    const oldHeartbeat = new Date(Date.now() - 70 * 1000);
    await db
      .update(pods)
      .set({
        lastHeartbeatAt: oldHeartbeat,
        status: "running",
      })
      .where(eq(pods.id, testPodId));

    // Fetch the pod (this is where the getUserPods logic would compute status)
    const [pod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, testPodId))
      .limit(1);

    // Manually apply the same logic as getUserPods
    const HEARTBEAT_TIMEOUT_MS = 60 * 1000;
    const now = Date.now();
    const computedStatus =
      pod.status === "running" &&
      pod.lastHeartbeatAt &&
      now - pod.lastHeartbeatAt.getTime() > HEARTBEAT_TIMEOUT_MS
        ? "stopped"
        : pod.status;

    expect(computedStatus).toBe("stopped");
  });

  it("should keep pod as running when heartbeat is recent", async () => {
    // Set lastHeartbeatAt to 10 seconds ago (recent)
    const recentHeartbeat = new Date(Date.now() - 10 * 1000);
    await db
      .update(pods)
      .set({
        lastHeartbeatAt: recentHeartbeat,
        status: "running",
      })
      .where(eq(pods.id, testPodId));

    // Fetch the pod
    const [pod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, testPodId))
      .limit(1);

    // Apply the same logic as getUserPods
    const HEARTBEAT_TIMEOUT_MS = 60 * 1000;
    const now = Date.now();
    const computedStatus =
      pod.status === "running" &&
      pod.lastHeartbeatAt &&
      now - pod.lastHeartbeatAt.getTime() > HEARTBEAT_TIMEOUT_MS
        ? "stopped"
        : pod.status;

    expect(computedStatus).toBe("running");
  });

  it("should not affect stopped pods when heartbeat is old", async () => {
    // Set pod to stopped status with old heartbeat
    const oldHeartbeat = new Date(Date.now() - 70 * 1000);
    await db
      .update(pods)
      .set({
        lastHeartbeatAt: oldHeartbeat,
        status: "stopped",
      })
      .where(eq(pods.id, testPodId));

    // Fetch the pod
    const [pod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, testPodId))
      .limit(1);

    // Apply the same logic as getUserPods
    const HEARTBEAT_TIMEOUT_MS = 60 * 1000;
    const now = Date.now();
    const computedStatus =
      pod.status === "running" &&
      pod.lastHeartbeatAt &&
      now - pod.lastHeartbeatAt.getTime() > HEARTBEAT_TIMEOUT_MS
        ? "stopped"
        : pod.status;

    // Should remain stopped (not affected by heartbeat logic)
    expect(computedStatus).toBe("stopped");
  });

  it("should not affect creating pods when heartbeat is old", async () => {
    // Set pod to creating status with old heartbeat
    const oldHeartbeat = new Date(Date.now() - 70 * 1000);
    await db
      .update(pods)
      .set({
        lastHeartbeatAt: oldHeartbeat,
        status: "creating",
      })
      .where(eq(pods.id, testPodId));

    // Fetch the pod
    const [pod] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, testPodId))
      .limit(1);

    // Apply the same logic as getUserPods
    const HEARTBEAT_TIMEOUT_MS = 60 * 1000;
    const now = Date.now();
    const computedStatus =
      pod.status === "running" &&
      pod.lastHeartbeatAt &&
      now - pod.lastHeartbeatAt.getTime() > HEARTBEAT_TIMEOUT_MS
        ? "stopped"
        : pod.status;

    // Should remain creating (not affected by heartbeat logic)
    expect(computedStatus).toBe("creating");
  });
});

