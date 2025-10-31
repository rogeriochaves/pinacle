import { execSync, spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../lib/db";
import {
  invoices,
  stripeCustomers,
  stripeEvents,
  stripeSubscriptions,
  users,
} from "../../../../../lib/db/schema";

/**
 * Integration tests using real Stripe CLI
 *
 * This test suite:
 * 1. Starts Next.js server on port 3456
 * 2. Starts stripe listen forwarding to that server
 * 3. Triggers real Stripe events via CLI
 * 4. Verifies database changes
 */

const TEST_PORT = 3456;
const WEBHOOK_URL = `http://localhost:${TEST_PORT}/api/webhooks/stripe`;

describe("Stripe CLI Integration Tests", () => {
  let serverProcess: ReturnType<typeof spawn> | null = null;
  let stripeListenProcess: ReturnType<typeof spawn> | null = null;
  let stripeWebhookSecret: string | null = null;

  beforeAll(async () => {
    console.log("🚀 Starting integration test environment...");

    // Kill any existing node/concurrently processes
    try {
      execSync("pkill -f 'concurrently' || true", { stdio: "ignore" });
      execSync("pkill -f 'node.*server.ts' || true", { stdio: "ignore" });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("  ✓ Cleaned up existing processes");
    } catch {
      // Ignore errors
    }

    // Check if stripe CLI is available
    try {
      execSync("stripe --version", { stdio: "ignore" });
    } catch {
      throw new Error(
        "Stripe CLI not found. Install it from https://stripe.com/docs/stripe-cli",
      );
    }

    // Clean up any previous test data
    await db.delete(stripeEvents).execute();
    await db.delete(stripeSubscriptions).execute();
    await db.delete(stripeCustomers).execute();
    await db.delete(invoices).execute();
    await db.delete(users).where(eq(users.email, "stripe-test@pinacle.dev")).execute();
    console.log("  ✓ Cleaned up test data");

    // STEP 1: Start stripe listen FIRST to get the webhook secret
    console.log("  ⏳ Starting stripe listen...");
    stripeListenProcess = spawn(
      "stripe",
      ["listen", "--forward-to", WEBHOOK_URL],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    // Capture webhook secret from stripe listen output
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Failed to get webhook secret within 20 seconds"));
      }, 20000);

      stripeListenProcess!.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        console.log(`  [stripe listen] ${output.trim()}`);
      });

      stripeListenProcess!.stderr?.on("data", (data: Buffer) => {
        console.error(`  [stripe listen error] ${data.toString()}`);

        // Look for webhook secret
        const secretMatch = data.toString().match(/whsec_[a-zA-Z0-9]+/);
        if (secretMatch && !stripeWebhookSecret) {
          stripeWebhookSecret = secretMatch[0];
          console.log(
            `  ✓ Got webhook secret: ${stripeWebhookSecret?.substring(0, 15)}...`,
          );
          // Stripe listen is ready once we have the secret
          clearTimeout(timeout);
          console.log("  ✓ Stripe listen is ready");
          resolve();
        }
      });
    });

    // STEP 2: Now start Next.js server with the webhook secret in env
    console.log(`  ⏳ Starting Next.js server on port ${TEST_PORT} with webhook secret...`);
    serverProcess = spawn("pnpm", ["dev"], {
      env: {
        ...process.env,
        PORT: TEST_PORT.toString(),
        NODE_ENV: "development",
        STRIPE_WEBHOOK_SECRET: stripeWebhookSecret || "", // Use the secret from stripe listen
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Log ALL server output for debugging
    serverProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`  [server] ${output}`);
      }
    });

    serverProcess.stderr?.on("data", (data: Buffer) => {
      const output = data.toString().trim();
      if (output) {
        console.error(`  [server stderr] ${output}`);
      }
    });

    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Server failed to start within 60 seconds"));
      }, 60000);

      const checkServer = setInterval(async () => {
        try {
          const response = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const text = await response.text();
          if (text.includes("Missing signature")) {
            clearTimeout(timeout);
            clearInterval(checkServer);
            console.log("  ✓ Server is ready");
            resolve();
          }
        } catch {
          // Server not ready yet
        }
      }, 500);
    });

    console.log("✅ Test environment ready!\n");
  }, 90000); // 90 seconds for server + stripe listen startup

  afterAll(async () => {
    console.log("\n🧹 Cleaning up test environment...");

    if (stripeListenProcess) {
      stripeListenProcess.kill();
      console.log("  ✓ Stopped stripe listen");
    }

    if (serverProcess) {
      serverProcess.kill();
      console.log("  ✓ Stopped Next.js server");
    }

    // Give processes time to clean up
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });


  it("USER JOURNEY: Happy path - user signs up, subscribes, and payment succeeds", async () => {
    console.log("\n🎬 JOURNEY 1: Happy Path - Signup → Subscribe → Payment Success\n");

    // Clean up any previous test data for this user
    await db.delete(users).where(eq(users.email, "happy-user@pinacle.dev")).execute();

    // STEP 1: Create a real test user in our DB
    console.log("  📝 Step 1: Creating user in our database...");
    const [testUser] = await db
      .insert(users)
      .values({
        email: "happy-user@pinacle.dev",
        name: "Happy Path User",
        password: "test",
      })
      .returning();
    console.log(`    ✓ Created user: ${testUser.email}`);

    // STEP 2: Create a real Stripe customer
    console.log("  💳 Step 2: Creating Stripe customer...");
    const { stripe } = await import("../../../../../lib/stripe");
    const stripeCustomer = await stripe.customers.create({
      email: testUser.email,
      name: testUser.name ?? undefined,
      metadata: { userId: testUser.id },
    });
    console.log(`    ✓ Created Stripe customer: ${stripeCustomer.id}`);

    // STEP 3: Save Stripe customer to our DB
    await db.insert(stripeCustomers).values({
      userId: testUser.id,
      stripeCustomerId: stripeCustomer.id,
      currency: "usd",
      status: "inactive",
    });
    console.log(`    ✓ Linked customer to our database`);

    // STEP 4: Add a test payment method (valid card)
    console.log("  💰 Step 3: Adding payment method...");
    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: { token: "tok_visa" },
    });
    await stripe.paymentMethods.attach(paymentMethod.id, {
      customer: stripeCustomer.id,
    });
    await stripe.customers.update(stripeCustomer.id, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });
    console.log(`    ✓ Payment method attached`);

    // STEP 5: Create a subscription (triggers multiple webhooks)
    console.log("  📋 Step 4: Creating subscription...");
    const prices = await stripe.prices.list({ limit: 1 });
    if (prices.data.length === 0) {
      throw new Error("No prices found in Stripe. Run pnpm stripe:setup first");
    }

    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomer.id,
      items: [{ price: prices.data[0].id }],
      payment_settings: { payment_method_types: ["card"] },
    });
    console.log(`    ✓ Created subscription: ${subscription.id}`);

    // STEP 6: Wait for all webhooks to be processed
    console.log("  ⏳ Step 5: Waiting for webhooks to process...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // VERIFY: Check subscription was created and activated
    console.log("  ✅ Step 6: Verifying results...");
    const dbSubscription = await db
      .select()
      .from(stripeSubscriptions)
      .where(eq(stripeSubscriptions.stripeSubscriptionId, subscription.id))
      .limit(1);

    expect(dbSubscription.length).toBe(1);
    expect(dbSubscription[0].status).toBe("active");
    expect(dbSubscription[0].userId).toBe(testUser.id);
    console.log(`    ✓ Subscription is active`);

    // VERIFY: Check customer status is updated
    const dbCustomer = await db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, testUser.id))
      .limit(1);

    expect(dbCustomer[0].status).toBe("active");
    expect(dbCustomer[0].gracePeriodStartedAt).toBeNull();
    console.log(`    ✓ Customer status is active`);

    // VERIFY: Check invoice was created and paid
    const dbInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, testUser.id))
      .orderBy(invoices.createdAt);

    expect(dbInvoices.length).toBeGreaterThan(0);
    const latestInvoice = dbInvoices[dbInvoices.length - 1];
    expect(latestInvoice.status).toBe("paid");
    console.log(`    ✓ Invoice paid: ${latestInvoice.amountPaid / 100} ${latestInvoice.currency}`);

    // VERIFY: Check all events were processed successfully
    const subscriptionEvents = await db
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.eventType, "customer.subscription.created"))
      .orderBy(stripeEvents.createdAt);

    const subscriptionEvent = subscriptionEvents[subscriptionEvents.length - 1];
    expect(subscriptionEvent.processed).toBe(true);
    expect(subscriptionEvent.processingError).toBeNull();

    const paymentEvents = await db
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.eventType, "invoice.payment_succeeded"))
      .orderBy(stripeEvents.createdAt);

    const paymentEvent = paymentEvents[paymentEvents.length - 1];
    expect(paymentEvent.processed).toBe(true);
    expect(paymentEvent.processingError).toBeNull();

    console.log(`    ✓ All webhooks processed successfully`);
    console.log("\n  🎉 JOURNEY 1 COMPLETE: User is subscribed and active!\n");
  }, 90000);

  it("USER JOURNEY: Payment failure - user subscribes but payment fails, grace period starts", async () => {
    console.log("\n🎬 JOURNEY 2: Payment Failure → Grace Period\n");

    // Clean up any previous test data for this user
    await db.delete(users).where(eq(users.email, "payment-fail-user@pinacle.dev")).execute();

    // STEP 1: Create user
    console.log("  📝 Step 1: Creating user...");
    const [testUser] = await db
      .insert(users)
      .values({
        email: "payment-fail-user@pinacle.dev",
        name: "Payment Fail User",
        password: "test",
      })
      .returning();
    console.log(`    ✓ Created user: ${testUser.email}`);

    // STEP 2: Create Stripe customer
    console.log("  💳 Step 2: Creating Stripe customer...");
    const { stripe } = await import("../../../../../lib/stripe");
    const stripeCustomer = await stripe.customers.create({
      email: testUser.email,
      name: testUser.name ?? undefined,
      metadata: { userId: testUser.id },
    });

    await db.insert(stripeCustomers).values({
      userId: testUser.id,
      stripeCustomerId: stripeCustomer.id,
      currency: "usd",
      status: "inactive",
    });
    console.log(`    ✓ Customer created and linked`);

    // STEP 3: Simulate payment failure directly (bypassing Stripe's immediate decline)
    console.log("  💰 Step 3: Simulating payment failure...");

    // Import and call handlePaymentFailure directly to simulate the webhook
    const { handlePaymentFailure } = await import("../../../../../lib/billing/subscription-service");
    await handlePaymentFailure(stripeCustomer.id);
    console.log(`    ✓ Payment failure processed`);

    // VERIFY: Check grace period was started
    console.log("  ✅ Step 4: Verifying grace period...");
    const dbCustomer = await db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, testUser.id))
      .limit(1);

    expect(dbCustomer[0].gracePeriodStartedAt).not.toBeNull();
    expect(dbCustomer[0].status).toBe("past_due");
    console.log(`    ✓ Grace period started: ${dbCustomer[0].gracePeriodStartedAt?.toISOString()}`);
    console.log(`    ✓ Customer status: past_due`)

    console.log("\n  🎉 JOURNEY 2 COMPLETE: Payment failed, grace period active!\n");
  }, 90000);

  it("USER JOURNEY: Subscription cancellation - user cancels their subscription", async () => {
    console.log("\n🎬 JOURNEY 3: Subscription Cancellation\n");

    // Clean up any previous test data for this user
    await db.delete(users).where(eq(users.email, "cancel-user@pinacle.dev")).execute();

    // STEP 1: Create user with active subscription (reuse happy path setup)
    console.log("  📝 Step 1: Setting up user with active subscription...");
    const [testUser] = await db
      .insert(users)
      .values({
        email: "cancel-user@pinacle.dev",
        name: "Cancel User",
        password: "test",
      })
      .returning();

    const { stripe } = await import("../../../../../lib/stripe");
    const stripeCustomer = await stripe.customers.create({
      email: testUser.email,
      name: testUser.name ?? undefined,
      metadata: { userId: testUser.id },
    });

    await db.insert(stripeCustomers).values({
      userId: testUser.id,
      stripeCustomerId: stripeCustomer.id,
      currency: "usd",
      status: "active",
    });

    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: { token: "tok_visa" },
    });
    await stripe.paymentMethods.attach(paymentMethod.id, {
      customer: stripeCustomer.id,
    });
    await stripe.customers.update(stripeCustomer.id, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });

    const prices = await stripe.prices.list({ limit: 1 });
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomer.id,
      items: [{ price: prices.data[0].id }],
      payment_settings: { payment_method_types: ["card"] },
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));
    console.log(`    ✓ User setup complete with subscription: ${subscription.id}`);

    // STEP 2: Cancel the subscription
    console.log("  ❌ Step 2: Cancelling subscription...");
    await stripe.subscriptions.cancel(subscription.id);
    console.log(`    ✓ Subscription cancellation requested`);

    // STEP 3: Wait for cancellation webhook
    console.log("  ⏳ Step 3: Waiting for cancellation webhook...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // VERIFY: Check subscription is cancelled
    console.log("  ✅ Step 4: Verifying cancellation...");
    const dbSubscription = await db
      .select()
      .from(stripeSubscriptions)
      .where(eq(stripeSubscriptions.stripeSubscriptionId, subscription.id))
      .limit(1);

    expect(dbSubscription.length).toBe(1);
    expect(dbSubscription[0].status).toBe("canceled");
    console.log(`    ✓ Subscription status: canceled`);

    // VERIFY: Check customer status
    const dbCustomer = await db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, testUser.id))
      .limit(1);

    expect(dbCustomer[0].status).toBe("canceled");
    console.log(`    ✓ Customer status: canceled`);

    // VERIFY: Check webhook was processed
    const cancelEvents = await db
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.eventType, "customer.subscription.deleted"))
      .orderBy(stripeEvents.createdAt);

    const cancelEvent = cancelEvents[cancelEvents.length - 1];
    expect(cancelEvent.processed).toBe(true);
    expect(cancelEvent.processingError).toBeNull();
    console.log(`    ✓ Cancellation webhook processed`);

    console.log("\n  🎉 JOURNEY 3 COMPLETE: Subscription cancelled successfully!\n");
  }, 90000);
});
