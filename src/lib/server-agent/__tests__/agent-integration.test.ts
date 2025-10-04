/**
 * Integration test for server agent
 *
 * Tests the full flow:
 * 1. Agent registration
 * 2. Heartbeat updates
 * 3. Metrics reporting
 * 4. Per-pod metrics collection
 *
 * Requires:
 * - Lima VM (gvisor-alpine) running
 * - Next.js dev server running on localhost:3000
 * - PostgreSQL database running
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db";
import { serverMetrics, servers } from "../../db/schema";

const execAsync = promisify(exec);

const LIMA_VM = "gvisor-alpine";
const API_URL = "http://localhost:3000";

let testServerId: string | null = null;

describe("Server Agent Integration", () => {
  beforeAll(async () => {
    // Check Lima is running
    const isLimaRunning = await checkLimaRunning();
    if (!isLimaRunning) {
      throw new Error(
        `Lima VM "${LIMA_VM}" is not running. Start it with: limactl start ${LIMA_VM}`,
      );
    }

    // Check Next.js dev server is running
    const isDevServerRunning = await checkDevServerRunning();
    if (!isDevServerRunning) {
      throw new Error(
        "Next.js dev server is not running on localhost:3000. Start it with: pnpm dev",
      );
    }

    // Clean up any existing test servers
    await cleanupTestServers();

    // Use provision script to set everything up
    const command = `SSH_PUBLIC_KEY="${process.env.SSH_PUBLIC_KEY}" ./scripts/provision-server.sh --api-url ${API_URL} --api-key ${process.env.SERVER_API_KEY} --host lima:${LIMA_VM} --heartbeat-interval 5000`;
    console.log(
      "📦 Provisioning Lima VM with server agent with command:",
      command,
    );
    await execAsync(command);
    console.log("✅ Provisioning complete");
  }, 120_000);

  it("should register server on first startup", async () => {
    console.log("🔍 Checking for registered server...");

    // Wait a bit for registration to complete
    await new Promise((resolve) => setTimeout(resolve, 8000));

    // Check database for server
    const [server] = await db
      .select()
      .from(servers)
      .orderBy(desc(servers.createdAt))
      .limit(1);

    expect(server).toBeDefined();
    expect(server.status).toBe("online");
    expect(server.hostname).toBeTruthy();
    expect(server.ipAddress).toBeTruthy();
    expect(server.cpuCores).toBeGreaterThan(0);
    expect(server.memoryMb).toBeGreaterThan(0);

    testServerId = server.id;

    console.log(`✅ Server registered: ${server.id}`);
  }, 30_000);

  it("should send heartbeat updates", async () => {
    expect(testServerId).toBeTruthy();

    // Wait for first heartbeat/metrics cycle (5s interval + processing time)
    await new Promise((resolve) => setTimeout(resolve, 7000));

    // Get initial heartbeat
    const [server1] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, testServerId!))
      .limit(1);

    const firstHeartbeat = server1.lastHeartbeatAt;
    expect(firstHeartbeat).toBeTruthy();

    // Wait for next heartbeat
    await new Promise((resolve) => setTimeout(resolve, 6000));

    // Get updated heartbeat
    const [server2] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, testServerId!))
      .limit(1);

    const secondHeartbeat = server2.lastHeartbeatAt;
    expect(secondHeartbeat).toBeTruthy();
    expect(secondHeartbeat!.getTime()).toBeGreaterThan(
      firstHeartbeat!.getTime(),
    );

    console.log("✅ Heartbeat updated");
  }, 20_000);

  it("should report server metrics", async () => {
    expect(testServerId).toBeTruthy();

    // Metrics are sent along with heartbeat, so wait for first cycle
    await new Promise((resolve) => setTimeout(resolve, 7000));

    // Check database for metrics
    const metrics = await db
      .select()
      .from(serverMetrics)
      .where(eq(serverMetrics.serverId, testServerId!))
      .orderBy(desc(serverMetrics.createdAt))
      .limit(1);

    expect(metrics).toHaveLength(1);

    const [metric] = metrics;
    expect(metric.cpuUsagePercent).toBeGreaterThanOrEqual(0);
    expect(metric.cpuUsagePercent).toBeLessThanOrEqual(100);
    expect(metric.memoryUsageMb).toBeGreaterThan(0);
    expect(metric.diskUsageGb).toBeGreaterThan(0);
    expect(metric.activePodsCount).toBeGreaterThanOrEqual(0);

    console.log(
      `✅ Metrics reported: CPU ${metric.cpuUsagePercent}%, Memory ${metric.memoryUsageMb}MB`,
    );
  }, 15_000);

  it("should collect per-pod metrics if pods are running", async () => {
    expect(testServerId).toBeTruthy();

    // Wait for first metrics cycle
    await new Promise((resolve) => setTimeout(resolve, 7000));

    // Check if any pods are running
    const { stdout: containerList } = await execAsync(
      `limactl shell ${LIMA_VM} -- docker ps --filter name=pinacle-pod- --format '{{.ID}}'`,
    );

    const containerIds = containerList.trim().split("\n").filter(Boolean);

    if (containerIds.length > 0) {
      console.log(
        `Found ${containerIds.length} running pods, checking metrics...`,
      );

      // The pod metrics would be in pod_metrics table
      // For now, just verify the count is reported correctly
      const [metric] = await db
        .select()
        .from(serverMetrics)
        .where(eq(serverMetrics.serverId, testServerId!))
        .orderBy(desc(serverMetrics.createdAt))
        .limit(1);

      expect(metric.activePodsCount).toBe(containerIds.length);
      console.log(`✅ Per-pod metrics: ${containerIds.length} pods tracked`);
    } else {
      console.log("⚠️  No pods running, skipping per-pod metrics test");
    }
  }, 20_000);
});

// Helper functions

async function checkLimaRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync("limactl list --format json");
    const vms = stdout
      .trim()
      .split("\n")
      .map((json) => JSON.parse(json));
    const vm = vms.find(
      (v: { name: string; status: string }) =>
        v.name === LIMA_VM && v.status === "Running",
    );
    return !!vm;
  } catch {
    return false;
  }
}

async function checkDevServerRunning(): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:3000/api/trpc/servers.ping");
    return response.ok;
  } catch {
    return false;
  }
}

async function cleanupTestServers(): Promise<void> {
  // Delete any test servers from previous runs
  // The provision script will register with hostname from the Lima VM
  const allServers = await db.select().from(servers);
  // Clean up any servers that look like test servers
  for (const server of allServers) {
    if (
      server.hostname.includes("lima") ||
      server.hostname.includes("gvisor-alpine")
    ) {
      // Stop the current server agent
      await execAsync(
        `limactl shell ${LIMA_VM} -- sudo rc-service pinacle-agent stop`,
      );
      // Delete the server-config.json file from the Lima VM
      await execAsync(
        `limactl shell ${LIMA_VM} -- rm -f /opt/pinacle/server-agent/.server-config.json`,
      );
      await db.delete(servers).where(eq(servers.id, server.id));
    }
  }
}
