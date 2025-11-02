import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db";
import {
  podSnapshots,
  pods,
  servers,
  stripeCustomers,
  teams,
  usageRecords,
  users,
} from "../../db/schema";
import { generateKSUID } from "../../utils";
import { usageTracker } from "../usage-tracker";

/**
 * Usage Tracker Unit Tests
 *
 * Tests usage tracking without full pod provisioning:
 * - Uses real database
 * - Mocks pod records (no actual container creation)
 * - Mocks Stripe API calls
 */

// Mock Stripe
vi.mock("../../stripe", () => ({
  stripe: {
    billing: {
      meterEvents: {
        create: vi.fn().mockResolvedValue({
          identifier: "mock_meter_event_id",
          event_name: "pod_runtime_dev_small",
        }),
      },
    },
  },
}));

describe("Usage Tracker Tests", () => {
  let testUserId: string;
  let testTeamId: string;
  let testServerId: string;
  let testStripeCustomerId: string;

  beforeAll(async () => {
    // Clean up any existing test data
    await db.delete(usageRecords).execute();
    await db
      .delete(pods)
      .where(eq(pods.name, "Test Usage Pod"))
      .execute();
    await db
      .delete(stripeCustomers)
      .where(eq(stripeCustomers.stripeCustomerId, "cus_test_usage"))
      .execute();
    await db
      .delete(users)
      .where(eq(users.email, "usage-test@pinacle.dev"))
      .execute();
    await db
      .delete(teams)
      .where(eq(teams.name, "Test Usage Team"))
      .execute();
    await db
      .delete(servers)
      .where(eq(servers.hostname, "usage-test.example.com"))
      .execute();

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: "usage-test@pinacle.dev",
        name: "Usage Test User",
        password: "test",
      })
      .returning();
    testUserId = user.id;

    // Create test team
    const [team] = await db
      .insert(teams)
      .values({
        name: "Test Usage Team",
        slug: "test-usage-team",
        ownerId: testUserId,
      })
      .returning();
    testTeamId = team.id;

    // Create test server
    const [server] = await db
      .insert(servers)
      .values({
        hostname: "usage-test.example.com",
        ipAddress: "10.0.0.1",
        sshHost: "usage-test.example.com",
        sshPort: 22,
        sshUser: "root",
        status: "online",
        cpuCores: 4,
        memoryMb: 8192,
        diskGb: 100,
      })
      .returning();
    testServerId = server.id;

    // Create test Stripe customer
    const [stripeCustomer] = await db
      .insert(stripeCustomers)
      .values({
        userId: testUserId,
        stripeCustomerId: "cus_test_usage",
        stripeSubscriptionId: "sub_test_usage",
        currency: "usd",
        status: "active",
      })
      .returning();
    testStripeCustomerId = stripeCustomer.stripeCustomerId;
  });

  beforeEach(async () => {
    // Clean up usage records and pods before each test
    await db.delete(usageRecords).execute();
    await db
      .delete(pods)
      .where(eq(pods.teamId, testTeamId))
      .execute();
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(usageRecords).execute();
    await db.delete(podSnapshots).execute();
    await db
      .delete(pods)
      .where(eq(pods.teamId, testTeamId))
      .execute();
    await db
      .delete(stripeCustomers)
      .where(eq(stripeCustomers.userId, testUserId))
      .execute();
    await db.delete(users).where(eq(users.id, testUserId)).execute();
    await db.delete(teams).where(eq(teams.id, testTeamId)).execute();
    if (testServerId) {
      await db.delete(servers).where(eq(servers.id, testServerId)).execute();
    }
  });

  it("should track hourly usage for running pods with correct quantity (1.0)", async () => {
    console.log("\n📊 TEST: Track hourly usage for running pods\n");

    // Create a mock running pod (no actual container)
    const podConfig = {
      version: "1.0",
      tier: "dev.small",
      services: ["web-terminal"],
    };

    const [pod] = await db
      .insert(pods)
      .values({
        name: "Test Usage Pod",
        slug: "test-usage-pod",
        teamId: testTeamId,
        ownerId: testUserId,
        serverId: testServerId,
        status: "running",
        config: JSON.stringify(podConfig),
        monthlyPrice: 700, // $7/month
      })
      .returning();

    console.log(`  ✓ Created mock running pod: ${pod.id}`);

    // Track usage
    await usageTracker.trackPodRuntime();

    // Verify usage record was created
    const records = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.podId, pod.id));

    expect(records.length).toBe(1);
    expect(records[0].userId).toBe(testUserId);
    expect(records[0].tierId).toBe("dev.small");
    expect(records[0].recordType).toBe("runtime");
    expect(records[0].quantity).toBe(1.0); // Exactly 1 hour
    expect(records[0].reportedToStripe).toBe(true); // Auto-reported

    console.log(`  ✓ Usage record created: ${records[0].quantity} hours`);
    console.log(`  ✓ Tier: ${records[0].tierId}`);
    console.log(`  ✓ Reported to Stripe: ${records[0].reportedToStripe}`);
  });

  it("should report usage to Stripe with correct event_name and payload", async () => {
    console.log("\n📊 TEST: Report usage to Stripe billing meters\n");

    const { stripe } = await import("../../stripe");

    // Create a mock running pod
    const podConfig = {
      version: "1.0",
      tier: "dev.medium",
      services: ["code-server"],
    };

    const [_pod] = await db
      .insert(pods)
      .values({
        name: "Test Stripe Reporting Pod",
        slug: "test-stripe-reporting-pod",
        teamId: testTeamId,
        ownerId: testUserId,
        serverId: testServerId,
        status: "running",
        config: JSON.stringify(podConfig),
        monthlyPrice: 1400, // $14/month
      })
      .returning();

    // Track usage (which should auto-report to Stripe)
    await usageTracker.trackPodRuntime();

    // Verify Stripe was called
    expect(stripe.billing.meterEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "pod_runtime_dev_medium",
        payload: expect.objectContaining({
          stripe_customer_id: testStripeCustomerId,
          hours: "1",
        }),
      }),
    );

    console.log(`  ✓ Stripe meter event created`);
    console.log(`  ✓ Event name: pod_runtime_dev_medium`);
    console.log(`  ✓ Customer ID: ${testStripeCustomerId}`);
    console.log(`  ✓ Hours: 1`);
  });

  it("should track usage for multiple pods on different tiers", async () => {
    console.log("\n📊 TEST: Track usage for multiple pods on different tiers\n");

    // Create pods on different tiers
    const tiers = [
      { tier: "dev.small", price: 700 },
      { tier: "dev.medium", price: 1400 },
      { tier: "dev.large", price: 2800 },
    ];

    const createdPods: string[] = [];

    for (const { tier, price } of tiers) {
      const [pod] = await db
        .insert(pods)
        .values({
          name: `Test ${tier} Pod`,
          slug: `test-${tier.replace(".", "-")}-pod`,
          teamId: testTeamId,
          ownerId: testUserId,
          serverId: testServerId,
          status: "running",
          config: JSON.stringify({
            version: "1.0",
            tier,
            services: ["web-terminal"],
          }),
          monthlyPrice: price,
        })
        .returning();
      createdPods.push(pod.id);
      console.log(`  ✓ Created mock pod on ${tier}`);
    }

    // Track usage for all pods
    await usageTracker.trackPodRuntime();

    // Verify usage records for each tier
    for (let i = 0; i < tiers.length; i++) {
      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.podId, createdPods[i]));

      expect(records.length).toBe(1);
      expect(records[0].tierId).toBe(tiers[i].tier);
      expect(records[0].quantity).toBe(1.0);
      console.log(`  ✓ ${tiers[i].tier}: 1.0 hours tracked`);
    }

    // Verify total usage records
    const allRecords = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.userId, testUserId));

    expect(allRecords.length).toBe(3);
    console.log(`  ✓ Total usage records: ${allRecords.length}`);
  });

  it("should create initial 1-hour usage record when pod finishes provisioning", async () => {
    console.log("\n📊 TEST: Track initial 1-hour usage on pod provisioning\n");

    // Create a mock pod (simulating just-provisioned)
    const podId = generateKSUID("pod");
    const tierId = "dev.small";

    // Call trackInitialPodUsage (what provisioning service calls)
    await usageTracker.trackInitialPodUsage(podId, testUserId, tierId);

    // Verify initial usage record was created
    const records = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.podId, podId));

    expect(records.length).toBe(1);
    expect(records[0].quantity).toBe(1.0);
    expect(records[0].tierId).toBe(tierId);
    expect(records[0].reportedToStripe).toBe(true);

    console.log(`  ✓ Initial usage record created for pod ${podId}`);
    console.log(`  ✓ Quantity: 1.0 hours`);
    console.log(`  ✓ Immediately reported to Stripe`);
  });

  it("should retry unreported usage records", async () => {
    console.log("\n📊 TEST: Retry unreported usage records\n");

    // Create a usage record that "failed" to report
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const [unreportedRecord] = await db
      .insert(usageRecords)
      .values({
        userId: testUserId,
        podId: generateKSUID("pod"),
        tierId: "dev.small",
        recordType: "runtime",
        quantity: 1.0,
        periodStart: hourAgo,
        periodEnd: now,
        reportedToStripe: false, // Failed to report
        createdAt: hourAgo, // Created an hour ago
      })
      .returning();

    console.log(`  ✓ Created unreported usage record: ${unreportedRecord.id}`);

    // Run retry logic
    await usageTracker.retryUnreportedUsage();

    // Verify record was marked as reported
    const [retried] = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.id, unreportedRecord.id));

    expect(retried.reportedToStripe).toBe(true);
    console.log(`  ✓ Record marked as reported after retry`);
  });

  it("should handle pods without Stripe customer gracefully", async () => {
    console.log("\n📊 TEST: Handle pods without Stripe customer\n");

    // Create a user without Stripe customer
    const [userWithoutStripe] = await db
      .insert(users)
      .values({
        email: "no-stripe@pinacle.dev",
        name: "No Stripe User",
        password: "test",
      })
      .returning();

    const [teamWithoutStripe] = await db
      .insert(teams)
      .values({
        name: "No Stripe Team",
        slug: "no-stripe-team",
        ownerId: userWithoutStripe.id,
      })
      .returning();

    // Create a pod for this user
    const [pod] = await db
      .insert(pods)
      .values({
        name: "No Stripe Pod",
        slug: "no-stripe-pod",
        teamId: teamWithoutStripe.id,
        ownerId: userWithoutStripe.id,
        serverId: testServerId,
        status: "running",
        config: JSON.stringify({
          version: "1.0",
          tier: "dev.small",
          services: ["web-terminal"],
        }),
        monthlyPrice: 700,
      })
      .returning();

    // Track usage (should not throw error)
    await expect(usageTracker.trackPodRuntime()).resolves.not.toThrow();

    // Verify usage record was created but NOT reported
    const records = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.podId, pod.id));

    expect(records.length).toBe(1);
    expect(records[0].reportedToStripe).toBe(false); // Can't report without Stripe customer

    console.log(`  ✓ Usage record created without Stripe customer`);
    console.log(`  ✓ Marked as not reported (expected)`);

    // Clean up
    await db.delete(pods).where(eq(pods.id, pod.id)).execute();
    await db.delete(teams).where(eq(teams.id, teamWithoutStripe.id)).execute();
    await db.delete(users).where(eq(users.id, userWithoutStripe.id)).execute();
  });

  it("should track only running pods, not stopped pods", async () => {
    console.log("\n📊 TEST: Only track running pods\n");

    // Create one running pod and one stopped pod
    const [runningPod] = await db
      .insert(pods)
      .values({
        name: "Running Pod",
        slug: "running-pod",
        teamId: testTeamId,
        ownerId: testUserId,
        serverId: testServerId,
        status: "running",
        config: JSON.stringify({
          version: "1.0",
          tier: "dev.small",
          services: ["web-terminal"],
        }),
        monthlyPrice: 700,
      })
      .returning();

    const [stoppedPod] = await db
      .insert(pods)
      .values({
        name: "Stopped Pod",
        slug: "stopped-pod",
        teamId: testTeamId,
        ownerId: testUserId,
        serverId: testServerId,
        status: "stopped",
        config: JSON.stringify({
          version: "1.0",
          tier: "dev.small",
          services: ["web-terminal"],
        }),
        monthlyPrice: 700,
      })
      .returning();

    console.log(`  ✓ Created running pod: ${runningPod.id}`);
    console.log(`  ✓ Created stopped pod: ${stoppedPod.id}`);

    // Track usage
    await usageTracker.trackPodRuntime();

    // Verify only running pod has usage record
    const runningRecords = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.podId, runningPod.id));

    const stoppedRecords = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.podId, stoppedPod.id));

    expect(runningRecords.length).toBe(1);
    expect(stoppedRecords.length).toBe(0);

    console.log(`  ✓ Running pod tracked: ${runningRecords.length} record`);
    console.log(`  ✓ Stopped pod NOT tracked: ${stoppedRecords.length} records`);
  });

  it("should track snapshot storage and calculate MB correctly", async () => {
    console.log("\n📊 TEST: Track snapshot storage\n");

    // Create a pod first
    const [pod] = await db
      .insert(pods)
      .values({
        name: "Pod with Snapshot",
        slug: "pod-with-snapshot",
        teamId: testTeamId,
        ownerId: testUserId,
        serverId: testServerId,
        status: "running",
        config: JSON.stringify({
          version: "1.0",
          tier: "dev.small",
          services: ["web-terminal"],
        }),
        monthlyPrice: 700,
      })
      .returning();

    // Create a 200MB snapshot
    const sizeBytes = 200 * 1024 * 1024; // 200 MB
    const [snapshot] = await db
      .insert(podSnapshots)
      .values({
        podId: pod.id,
        name: "test-snapshot",
        storagePath: "/path/to/snapshot",
        sizeBytes: sizeBytes,
        status: "ready",
      })
      .returning();

    console.log(`  ✓ Created 200MB snapshot: ${snapshot.id}`);

    // Track snapshot storage
    await usageTracker.trackSnapshotStorage();

    // Verify usage record was created
    const records = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.tierId, "snapshot_storage"));

    expect(records.length).toBe(1);
    expect(records[0].userId).toBe(testUserId);
    expect(records[0].podId).toBe(pod.id);
    expect(records[0].recordType).toBe("storage");
    expect(records[0].quantity).toBe(200); // 200 MB
    expect(records[0].reportedToStripe).toBe(true);

    console.log(`  ✓ Storage record created: ${records[0].quantity} MB`);
    console.log(`  ✓ Reported to Stripe: ${records[0].reportedToStripe}`);

    // Verify Stripe was called
    const { stripe } = await import("../../stripe");
    expect(stripe.billing.meterEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "snapshot_storage",
        payload: expect.objectContaining({
          stripe_customer_id: testStripeCustomerId,
          mb_hours: "200",
        }),
      }),
    );

    console.log(`  ✓ Stripe meter event created for snapshot storage`);
  });

  it("should track multiple snapshots and aggregate MB-hours", async () => {
    console.log("\n📊 TEST: Track multiple snapshots\n");

    // Create pods and snapshots of different sizes
    const snapshots = [
      { size: 100, name: "snapshot-100mb" },
      { size: 250, name: "snapshot-250mb" },
      { size: 500, name: "snapshot-500mb" },
    ];

    for (const { size, name } of snapshots) {
      const [pod] = await db
        .insert(pods)
        .values({
          name: `Pod ${name}`,
          slug: `pod-${name}`,
          teamId: testTeamId,
          ownerId: testUserId,
          serverId: testServerId,
          status: "running",
          config: JSON.stringify({
            version: "1.0",
            tier: "dev.small",
            services: ["web-terminal"],
          }),
          monthlyPrice: 700,
        })
        .returning();

      await db.insert(podSnapshots).values({
        podId: pod.id,
        name,
        storagePath: `/path/to/${name}`,
        sizeBytes: size * 1024 * 1024,
        status: "ready",
      });

      console.log(`  ✓ Created ${size}MB snapshot`);
    }

    // Track snapshot storage
    await usageTracker.trackSnapshotStorage();

    // Verify usage records
    const records = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.tierId, "snapshot_storage"));

    expect(records.length).toBe(3);

    const totalMb = records.reduce((sum, r) => sum + r.quantity, 0);
    expect(totalMb).toBe(850); // 100 + 250 + 500

    console.log(`  ✓ Total MB tracked: ${totalMb}`);
  });

  it("should skip snapshots in creating or failed status", async () => {
    console.log("\n📊 TEST: Skip non-ready snapshots\n");

    // Create a pod
    const [pod] = await db
      .insert(pods)
      .values({
        name: "Pod with Creating Snapshot",
        slug: "pod-with-creating-snapshot",
        teamId: testTeamId,
        ownerId: testUserId,
        serverId: testServerId,
        status: "running",
        config: JSON.stringify({
          version: "1.0",
          tier: "dev.small",
          services: ["web-terminal"],
        }),
        monthlyPrice: 700,
      })
      .returning();

    // Create snapshots in different states
    await db.insert(podSnapshots).values({
      podId: pod.id,
      name: "creating-snapshot",
      storagePath: "/path/creating",
      sizeBytes: 100 * 1024 * 1024,
      status: "creating",
    });

    await db.insert(podSnapshots).values({
      podId: pod.id,
      name: "failed-snapshot",
      storagePath: "/path/failed",
      sizeBytes: 200 * 1024 * 1024,
      status: "failed",
    });

    await db.insert(podSnapshots).values({
      podId: pod.id,
      name: "ready-snapshot",
      storagePath: "/path/ready",
      sizeBytes: 300 * 1024 * 1024,
      status: "ready",
    });

    console.log(`  ✓ Created 3 snapshots (creating, failed, ready)`);

    // Track snapshot storage
    await usageTracker.trackSnapshotStorage();

    // Verify only ready snapshot was tracked
    const records = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.tierId, "snapshot_storage"));

    expect(records.length).toBe(1);
    expect(records[0].quantity).toBe(300); // Only the ready snapshot

    console.log(`  ✓ Only ready snapshot tracked: ${records[0].quantity} MB`);
  });
});

