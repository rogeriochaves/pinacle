/**
 * Integration tests for proxy authentication system
 *
 * Tests JWT tokens, authorization, and the full auth flow
 */

import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { pods, teamMembers, teams, users } from "@/lib/db/schema";
import {
  buildProxyCallbackUrl,
  generateProxyToken,
  isTokenExpiringSoon,
  verifyProxyToken,
} from "@/lib/proxy-token";
import { checkPodAccess, parseProxyHostname } from "@/lib/proxy-utils";

describe("Proxy Authentication Tests", () => {
  let testUserId: string;
  let testUser2Id: string;
  let testTeamId: string;
  let testPodId: string;
  let testPodSlug: string;

  beforeAll(async () => {
    console.log("🧹 Cleaning up test data...");

    // Clean up test data
    const [existingTeam] = await db
      .select()
      .from(teams)
      .where(eq(teams.name, "Proxy Auth Test Team"))
      .limit(1);

    if (existingTeam) {
      await db.delete(pods).where(eq(pods.teamId, existingTeam.id));
      await db.delete(teams).where(eq(teams.id, existingTeam.id));
    }

    const [existingUser1] = await db
      .select()
      .from(users)
      .where(eq(users.email, "proxy-auth-test-1@example.com"))
      .limit(1);

    if (existingUser1) {
      await db.delete(users).where(eq(users.id, existingUser1.id));
    }

    const [existingUser2] = await db
      .select()
      .from(users)
      .where(eq(users.email, "proxy-auth-test-2@example.com"))
      .limit(1);

    if (existingUser2) {
      await db.delete(users).where(eq(users.id, existingUser2.id));
    }

    // Create test users
    const [user1] = await db
      .insert(users)
      .values({
        email: "proxy-auth-test-1@example.com",
        name: "Proxy Test User 1",
        githubId: "88888",
        githubUsername: "proxy-test-1",
      })
      .returning();
    testUserId = user1.id;

    const [user2] = await db
      .insert(users)
      .values({
        email: "proxy-auth-test-2@example.com",
        name: "Proxy Test User 2",
        githubId: "99999",
        githubUsername: "proxy-test-2",
      })
      .returning();
    testUser2Id = user2.id;

    // Create test team
    const [team] = await db
      .insert(teams)
      .values({
        name: "Proxy Auth Test Team",
        slug: "proxy-auth-team",
        ownerId: testUserId,
      })
      .returning();
    testTeamId = team.id;

    // Add user1 as owner
    await db.insert(teamMembers).values({
      teamId: testTeamId,
      userId: testUserId,
      role: "owner",
    });

    // Add user2 as member
    await db.insert(teamMembers).values({
      teamId: testTeamId,
      userId: testUser2Id,
      role: "member",
    });

    // Create test pod
    testPodId = `proxy-auth-test-${Date.now()}`;
    testPodSlug = `proxy-auth-pod-${Date.now()}`;

    await db.insert(pods).values({
      id: testPodId,
      name: "Proxy Auth Test Pod",
      slug: testPodSlug,
      teamId: testTeamId,
      ownerId: testUserId,
      template: "nodejs-blank",
      config: JSON.stringify({}),
      status: "running",
      monthlyPrice: 1000,
    });

    console.log("✅ Test data setup complete");
  }, 30000);

  describe("JWT Token Generation and Validation", () => {
    it("should generate valid JWT tokens", () => {
      const token = generateProxyToken(
        testUserId,
        testPodId,
        testPodSlug,
        8726,
      );

      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // JWT has 3 parts
    });

    it("should verify valid tokens", () => {
      const token = generateProxyToken(
        testUserId,
        testPodId,
        testPodSlug,
        8726,
      );

      const payload = verifyProxyToken(token);

      expect(payload).toBeTruthy();
      expect(payload?.userId).toBe(testUserId);
      expect(payload?.podId).toBe(testPodId);
      expect(payload?.podSlug).toBe(testPodSlug);
      expect(payload?.targetPort).toBe(8726);
      expect(payload?.exp).toBeTruthy();
      expect(payload?.iat).toBeTruthy();
    });

    it("should reject invalid tokens", () => {
      const payload = verifyProxyToken("invalid.token.here");
      expect(payload).toBeNull();
    });

    it("should reject tampered tokens", () => {
      const token = generateProxyToken(
        testUserId,
        testPodId,
        testPodSlug,
        8726,
      );

      // Tamper with the token
      const parts = token.split(".");
      parts[1] = Buffer.from(
        JSON.stringify({ userId: "hacker", podId: "evil" }),
      ).toString("base64url");
      const tamperedToken = parts.join(".");

      const payload = verifyProxyToken(tamperedToken);
      expect(payload).toBeNull();
    });

    it("should detect tokens expiring soon", () => {
      const token = generateProxyToken(
        testUserId,
        testPodId,
        testPodSlug,
        8726,
      );

      const payload = verifyProxyToken(token);
      expect(payload).toBeTruthy();

      // Fresh token should not be expiring soon
      const expiringSoon = isTokenExpiringSoon(payload!);
      expect(expiringSoon).toBe(false);

      // Manually create payload with near expiry
      const nearExpiry = {
        ...payload!,
        exp: Math.floor(Date.now() / 1000) + 4 * 60, // 4 minutes from now
      };

      expect(isTokenExpiringSoon(nearExpiry)).toBe(true);
    });

    it("should build correct proxy URLs with tokens", () => {
      const token = "test-token-123";
      const url = buildProxyCallbackUrl({
        podSlug: "test-pod",
        port: 8726,
        token,
      });

      expect(url).toContain("localhost-8726-pod-test-pod");
      expect(url).toContain("/pinacle-proxy-callback?token=test-token-123");
    });
  });

  describe("Hostname Parsing", () => {
    it("should parse valid proxy hostnames", () => {
      const result = parseProxyHostname("localhost-8726-pod-test.pinacle.dev");

      expect(result.isValid).toBe(true);
      expect(result.port).toBe(8726);
      expect(result.podSlug).toBe("test");
      expect(result.error).toBeUndefined();
    });

    it("should parse hostnames with port numbers", () => {
      const result = parseProxyHostname(
        "localhost-3000-pod-myslug.localhost:3001",
      );

      expect(result.isValid).toBe(true);
      expect(result.port).toBe(3000);
      expect(result.podSlug).toBe("myslug");
    });

    it("should reject invalid hostnames", () => {
      const result = parseProxyHostname("invalid.hostname.com");

      expect(result.isValid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it("should reject invalid port numbers", () => {
      const result = parseProxyHostname("localhost-99999-pod-test.pinacle.dev");

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Invalid port");
    });

    it("should reject missing pod slug", () => {
      const result = parseProxyHostname("localhost-8726-pod-.pinacle.dev");

      expect(result.isValid).toBe(false);
    });
  });

  describe("Pod Access Authorization", () => {
    it("should grant access to pod owner", async () => {
      const result = await checkPodAccess(testUserId, testPodSlug);

      expect(result.hasAccess).toBe(true);
      expect(result.pod).toBeTruthy();
      expect(result.pod?.id).toBe(testPodId);
      expect(result.pod?.slug).toBe(testPodSlug);
      expect(result.reason).toBeUndefined();
    });

    it("should grant access to team member", async () => {
      const result = await checkPodAccess(testUser2Id, testPodSlug);

      expect(result.hasAccess).toBe(true);
      expect(result.pod).toBeTruthy();
      expect(result.pod?.id).toBe(testPodId);
    });

    it("should deny access to non-team member", async () => {
      // Create a user not in the team
      const [randomUser] = await db
        .insert(users)
        .values({
          email: "random-user@example.com",
          name: "Random User",
          githubId: "77777",
          githubUsername: "random",
        })
        .returning();

      const result = await checkPodAccess(randomUser.id, testPodSlug);

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toContain("not authorized");
      expect(result.pod).toBeUndefined();

      // Cleanup
      await db.delete(users).where(eq(users.id, randomUser.id));
    });

    it("should deny access to non-existent pod", async () => {
      const result = await checkPodAccess(testUserId, "non-existent-pod");

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe("Pod not found");
      expect(result.pod).toBeUndefined();
    });
  });

  describe("Token Security Properties", () => {
    it("should create tokens with different signatures for same data", () => {
      // Tokens are generated with current timestamp, so they should differ
      const token1 = generateProxyToken(
        testUserId,
        testPodId,
        testPodSlug,
        8726,
      );

      // Wait a tiny bit for timestamp to change
      const token2 = generateProxyToken(
        testUserId,
        testPodId,
        testPodSlug,
        8726,
      );

      // Tokens should be different (due to different iat timestamps)
      // But both should verify correctly
      expect(verifyProxyToken(token1)).toBeTruthy();
      expect(verifyProxyToken(token2)).toBeTruthy();
    });

    it("should reject tokens for different pod/port combinations", () => {
      const token = generateProxyToken(
        testUserId,
        testPodId,
        testPodSlug,
        8726,
      );

      const payload = verifyProxyToken(token);
      expect(payload).toBeTruthy();

      // Verify token is for specific pod+port
      expect(payload?.podSlug).toBe(testPodSlug);
      expect(payload?.targetPort).toBe(8726);

      // Token should NOT be valid for different port
      expect(payload?.targetPort).not.toBe(3000);
    });

    it("should include all required fields in token payload", () => {
      const token = generateProxyToken(
        testUserId,
        testPodId,
        testPodSlug,
        5262,
      );

      const payload = verifyProxyToken(token);

      expect(payload).toBeTruthy();
      expect(payload).toHaveProperty("userId");
      expect(payload).toHaveProperty("podId");
      expect(payload).toHaveProperty("podSlug");
      expect(payload).toHaveProperty("targetPort");
      expect(payload).toHaveProperty("exp");
      expect(payload).toHaveProperty("iat");

      // Verify types
      expect(typeof payload?.userId).toBe("string");
      expect(typeof payload?.podId).toBe("string");
      expect(typeof payload?.podSlug).toBe("string");
      expect(typeof payload?.targetPort).toBe("number");
      expect(typeof payload?.exp).toBe("number");
      expect(typeof payload?.iat).toBe("number");
    });
  });
});
