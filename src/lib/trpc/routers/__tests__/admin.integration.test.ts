import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  pods,
  serverMetrics,
  servers,
  teamMembers,
  teams,
  users,
} from "@/lib/db/schema";
import {
  generatePinacleConfigFromForm,
  pinacleConfigToJSON,
} from "@/lib/pod-orchestration/pinacle-config";
import { appRouter } from "@/lib/trpc/root";
import { createInnerTRPCContext } from "@/lib/trpc/server";

describe("Admin Router Integration Tests", () => {
  let adminUserId: string;
  let regularUserId: string;
  let testServerId: string;
  let testPodId: string;
  let testTeamId: string;

  beforeAll(async () => {
    // Clean up any existing test data first (in reverse dependency order)
    // Find and delete test pods
    const existingPods = await db
      .select({ id: pods.id })
      .from(pods)
      .where(eq(pods.name, "Test Pod"));
    if (existingPods.length > 0) {
      await db.delete(pods).where(eq(pods.name, "Test Pod"));
    }

    // Find and delete server metrics
    const existingServers = await db
      .select({ id: servers.id })
      .from(servers)
      .where(eq(servers.hostname, "test-server"));
    if (existingServers.length > 0) {
      await db
        .delete(serverMetrics)
        .where(eq(serverMetrics.serverId, existingServers[0].id));
      await db.delete(servers).where(eq(servers.id, existingServers[0].id));
    }

    // Find and delete team members and teams
    const existingTeams = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.name, "Test Team"));
    if (existingTeams.length > 0) {
      await db
        .delete(teamMembers)
        .where(eq(teamMembers.teamId, existingTeams[0].id));
      await db.delete(teams).where(eq(teams.id, existingTeams[0].id));
    }

    // Delete test users
    await db.delete(users).where(eq(users.email, "admin@test.com"));
    await db.delete(users).where(eq(users.email, "user@test.com"));

    // Create admin user
    const [adminUser] = await db
      .insert(users)
      .values({
        email: "admin@test.com",
        name: "Admin User",
        githubUsername: "admin-test",
      })
      .returning();
    adminUserId = adminUser.id;

    // Create regular user
    const [regularUser] = await db
      .insert(users)
      .values({
        email: "user@test.com",
        name: "Regular User",
      })
      .returning();
    regularUserId = regularUser.id;

    // Create test team
    const [team] = await db
      .insert(teams)
      .values({
        name: "Test Team",
        slug: "test-team",
        ownerId: regularUserId,
      })
      .returning();
    testTeamId = team.id;

    // Add user to team
    await db.insert(teamMembers).values({
      teamId: testTeamId,
      userId: regularUserId,
      role: "owner",
    });

    // Create test server
    const [server] = await db
      .insert(servers)
      .values({
        hostname: "test-server",
        ipAddress: "192.168.1.100",
        cpuCores: 8,
        memoryMb: 16384,
        diskGb: 500,
        sshHost: "test.example.com",
        sshPort: 22,
        sshUser: "root",
        status: "online",
      })
      .returning();
    testServerId = server.id;

    // Create test server metrics
    await db.insert(serverMetrics).values({
      serverId: testServerId,
      cpuUsagePercent: 45.5,
      memoryUsageMb: 8192,
      diskUsageGb: 250.5,
      activePodsCount: 1,
    });

    // Create test pod
    const pinacleConfig = generatePinacleConfigFromForm({
      template: "custom",
      tier: "dev.medium",
      customServices: ["claude-code"],
    });

    const [pod] = await db
      .insert(pods)
      .values({
        name: "Test Pod",
        slug: "test-pod",
        teamId: testTeamId,
        ownerId: regularUserId,
        serverId: testServerId,
        config: pinacleConfigToJSON(pinacleConfig),
        status: "running",
        monthlyPrice: 1200,
      })
      .returning();
    testPodId = pod.id;
  });

  describe("isAdmin", () => {
    it("should return true for admin email", async () => {
      // Set ADMIN_EMAILS for test
      const originalEnv = process.env.ADMIN_EMAILS;
      process.env.ADMIN_EMAILS = "admin@test.com,another-admin@test.com";

      const ctx = createInnerTRPCContext({
        session: {
          user: { id: adminUserId, email: "admin@test.com" },
          expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        },
        req: null as any,
      });
      const caller = appRouter.createCaller(ctx);

      const result = await caller.admin.isAdmin();

      expect(result.isAdmin).toBe(true);

      // Restore env
      process.env.ADMIN_EMAILS = originalEnv;
    });

    it("should return false for non-admin email", async () => {
      const originalEnv = process.env.ADMIN_EMAILS;
      process.env.ADMIN_EMAILS = "admin@test.com";

      const ctx = createInnerTRPCContext({
        session: {
          user: { id: regularUserId, email: "user@test.com" },
          expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        },
        req: null as any,
      });
      const caller = appRouter.createCaller(ctx);

      const result = await caller.admin.isAdmin();

      expect(result.isAdmin).toBe(false);

      process.env.ADMIN_EMAILS = originalEnv;
    });
  });

  describe("getAllServers", () => {
    it("should return all servers with metrics for admin", async () => {
      const originalEnv = process.env.ADMIN_EMAILS;
      process.env.ADMIN_EMAILS = "admin@test.com";

      const ctx = createInnerTRPCContext({
        session: {
          user: { id: adminUserId, email: "admin@test.com" },
          expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        },
        req: null as any,
      });
      const caller = appRouter.createCaller(ctx);

      const servers = await caller.admin.getAllServers();

      expect(servers).toBeDefined();
      expect(servers.length).toBeGreaterThan(0);

      const testServer = servers.find((s) => s.id === testServerId);
      expect(testServer).toBeDefined();
      expect(testServer?.hostname).toBe("test-server");
      expect(testServer?.latestMetrics).toBeDefined();
      expect(testServer?.latestMetrics?.cpuUsagePercent).toBe(45.5);
      expect(testServer?.activePodsCount).toBeGreaterThanOrEqual(1);

      process.env.ADMIN_EMAILS = originalEnv;
    });

    it("should throw FORBIDDEN for non-admin user", async () => {
      const originalEnv = process.env.ADMIN_EMAILS;
      process.env.ADMIN_EMAILS = "admin@test.com";

      const ctx = createInnerTRPCContext({
        session: {
          user: { id: regularUserId, email: "user@test.com" },
          expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        },
        req: null as any,
      });
      const caller = appRouter.createCaller(ctx);

      await expect(caller.admin.getAllServers()).rejects.toThrow(
        "Admin access required",
      );

      process.env.ADMIN_EMAILS = originalEnv;
    });
  });

  describe("getServerById", () => {
    it("should return server details for admin", async () => {
      const originalEnv = process.env.ADMIN_EMAILS;
      process.env.ADMIN_EMAILS = "admin@test.com";

      const ctx = createInnerTRPCContext({
        session: {
          user: { id: adminUserId, email: "admin@test.com" },
          expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        },
        req: null as any,
      });
      const caller = appRouter.createCaller(ctx);

      const server = await caller.admin.getServerById({
        serverId: testServerId,
      });

      expect(server).toBeDefined();
      expect(server.id).toBe(testServerId);
      expect(server.hostname).toBe("test-server");
      expect(server.latestMetrics).toBeDefined();

      process.env.ADMIN_EMAILS = originalEnv;
    });
  });

  describe("getPodsOnServer", () => {
    it("should return pods on a server for admin", async () => {
      const originalEnv = process.env.ADMIN_EMAILS;
      process.env.ADMIN_EMAILS = "admin@test.com";

      const ctx = createInnerTRPCContext({
        session: {
          user: { id: adminUserId, email: "admin@test.com" },
          expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        },
        req: null as any,
      });
      const caller = appRouter.createCaller(ctx);

      const pods = await caller.admin.getPodsOnServer({
        serverId: testServerId,
      });

      expect(pods).toBeDefined();
      expect(pods.length).toBeGreaterThan(0);

      const testPod = pods.find((p) => p.id === testPodId);
      expect(testPod).toBeDefined();
      expect(testPod?.name).toBe("Test Pod");
      expect(testPod?.owner).toBeDefined();
      expect(testPod?.owner?.id).toBe(regularUserId);
      expect(testPod?.team).toBeDefined();
      expect(testPod?.team?.id).toBe(testTeamId);

      process.env.ADMIN_EMAILS = originalEnv;
    });
  });

  describe("getAllUsers", () => {
    it("should return all users for admin", async () => {
      const originalEnv = process.env.ADMIN_EMAILS;
      process.env.ADMIN_EMAILS = "admin@test.com";

      const ctx = createInnerTRPCContext({
        session: {
          user: { id: adminUserId, email: "admin@test.com" },
          expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        },
        req: null as any,
      });
      const caller = appRouter.createCaller(ctx);

      const users = await caller.admin.getAllUsers({});

      expect(users).toBeDefined();
      expect(users.length).toBeGreaterThanOrEqual(2);

      const adminFound = users.find((u) => u.user.id === adminUserId);
      expect(adminFound).toBeDefined();
      expect(adminFound?.user.email).toBe("admin@test.com");

      process.env.ADMIN_EMAILS = originalEnv;
    });

    it("should filter users by search term", async () => {
      const originalEnv = process.env.ADMIN_EMAILS;
      process.env.ADMIN_EMAILS = "admin@test.com";

      const ctx = createInnerTRPCContext({
        session: {
          user: { id: adminUserId, email: "admin@test.com" },
          expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        },
        req: null as any,
      });
      const caller = appRouter.createCaller(ctx);

      const users = await caller.admin.getAllUsers({ search: "Admin User" });

      expect(users).toBeDefined();
      expect(users.length).toBeGreaterThanOrEqual(1);
      expect(users[0]?.user.name).toContain("Admin");

      process.env.ADMIN_EMAILS = originalEnv;
    });
  });

  describe("getUserDetails", () => {
    it("should return user details with teams and pods", async () => {
      const originalEnv = process.env.ADMIN_EMAILS;
      process.env.ADMIN_EMAILS = "admin@test.com";

      const ctx = createInnerTRPCContext({
        session: {
          user: { id: adminUserId, email: "admin@test.com" },
          expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        },
        req: null as any,
      });
      const caller = appRouter.createCaller(ctx);

      const details = await caller.admin.getUserDetails({
        userId: regularUserId,
      });

      expect(details).toBeDefined();
      expect(details.user.id).toBe(regularUserId);
      expect(details.user.email).toBe("user@test.com");
      expect(details.teams.length).toBeGreaterThanOrEqual(1);
      expect(details.pods.length).toBeGreaterThanOrEqual(1);
      expect(details.pods[0]?.pod.id).toBe(testPodId);

      process.env.ADMIN_EMAILS = originalEnv;
    });
  });

  describe("getPlatformStats", () => {
    it("should return platform statistics", async () => {
      const originalEnv = process.env.ADMIN_EMAILS;
      process.env.ADMIN_EMAILS = "admin@test.com";

      const ctx = createInnerTRPCContext({
        session: {
          user: { id: adminUserId, email: "admin@test.com" },
          expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        },
        req: null as any,
      });
      const caller = appRouter.createCaller(ctx);

      const stats = await caller.admin.getPlatformStats();

      expect(stats).toBeDefined();
      expect(stats.totalUsers).toBeGreaterThanOrEqual(2);
      expect(stats.totalTeams).toBeGreaterThanOrEqual(1);
      expect(stats.totalPods).toBeGreaterThanOrEqual(1);
      expect(stats.totalServers).toBeGreaterThanOrEqual(1);
      expect(stats.onlineServers).toBeGreaterThanOrEqual(1);

      process.env.ADMIN_EMAILS = originalEnv;
    });
  });
});
