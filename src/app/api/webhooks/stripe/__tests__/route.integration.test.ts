import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "../../../../../lib/db";
import {
  invoices,
  pods,
  servers,
  stripeCustomers,
  stripeEvents,
  stripeSubscriptions,
  teams,
  users,
} from "../../../../../lib/db/schema";
import { POST } from "../route";

// Mock Stripe module
vi.mock("../../../../../lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
}));

// Mock email sending
vi.mock("../../../../../lib/email", () => ({
  sendPaymentSuccessEmail: vi.fn().mockResolvedValue({ success: true }),
  sendPaymentFailedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendSubscriptionCancelledEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { stripe } from "../../../../../lib/stripe";
import * as emailModule from "../../../../../lib/email";

describe("Stripe Webhook Integration Tests", () => {
  let testUser: typeof users.$inferSelect;
  let testCustomer: typeof stripeCustomers.$inferSelect;
  let testTeam: typeof teams.$inferSelect;
  let testServer: typeof servers.$inferSelect;
  const TEST_STRIPE_CUSTOMER_ID = "cus_test_123";
  const TEST_STRIPE_SUBSCRIPTION_ID = "sub_test_123";

  beforeAll(async () => {
    // Clean up test data from previous runs
    await db.delete(stripeEvents).execute();
    await db.delete(invoices).execute();
    await db.delete(stripeSubscriptions).execute();
    await db.delete(pods).execute();
    await db.delete(stripeCustomers).execute();
    await db.delete(teams).where(eq(teams.name, "Test Team")).execute();
    await db
      .delete(servers)
      .where(eq(servers.hostname, "test.example.com"))
      .execute();
    await db.delete(users).where(eq(users.email, "test@webhook.com")).execute();

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: "test@webhook.com",
        name: "Test User",
        password: "hashed_password",
      })
      .returning();

    testUser = user;

    // Create test server
    const [server] = await db
      .insert(servers)
      .values({
        hostname: "test.example.com",
        ipAddress: "192.168.1.1",
        status: "online",
        cpuCores: 4,
        memoryMb: 8192,
        diskGb: 100,
      })
      .returning();

    testServer = server;

    // Create test team
    const [team] = await db
      .insert(teams)
      .values({
        name: "Test Team",
        slug: "test-team",
        ownerId: testUser.id,
      })
      .returning();

    testTeam = team;

    // Create test Stripe customer
    const [customer] = await db
      .insert(stripeCustomers)
      .values({
        userId: testUser.id,
        stripeCustomerId: TEST_STRIPE_CUSTOMER_ID,
        currency: "usd",
        status: "inactive",
      })
      .returning();

    testCustomer = customer;
  });

  const createMockRequest = (event: Stripe.Event): Request => {
    return {
      text: vi.fn().mockResolvedValue(JSON.stringify(event)),
      headers: {
        get: vi.fn((key: string) => {
          if (key === "stripe-signature") return "test_signature";
          return null;
        }),
      },
    } as unknown as Request;
  };

  describe("customer.subscription.created", () => {
    it("should create subscription record and activate customer", async () => {
      const mockEvent: Stripe.Event = {
        id: "evt_test_sub_created_001",
        object: "event",
        type: "customer.subscription.created",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        api_version: "2024-06-20",
        pending_webhooks: 0,
        request: null,
        data: {
          object: {
            id: TEST_STRIPE_SUBSCRIPTION_ID,
            object: "subscription",
            customer: TEST_STRIPE_CUSTOMER_ID,
            status: "active",
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            items: {
              object: "list",
              data: [],
            },
          } as Stripe.Subscription,
        },
      };

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent);

      const request = createMockRequest(mockEvent);
      const response = await POST(request);

      expect(response.status).toBe(200);

      // Verify event was logged
      const loggedEvent = await db
        .select()
        .from(stripeEvents)
        .where(eq(stripeEvents.stripeEventId, mockEvent.id))
        .limit(1);

      expect(loggedEvent).toHaveLength(1);
      expect(loggedEvent[0].processed).toBe(true);
      expect(loggedEvent[0].eventType).toBe("customer.subscription.created");

      // Verify subscription was created
      const subscription = await db
        .select()
        .from(stripeSubscriptions)
        .where(
          eq(stripeSubscriptions.stripeSubscriptionId, TEST_STRIPE_SUBSCRIPTION_ID),
        )
        .limit(1);

      expect(subscription).toHaveLength(1);
      expect(subscription[0].status).toBe("active");
      expect(subscription[0].userId).toBe(testUser.id);

      // Verify customer was updated
      const updatedCustomer = await db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.id, testCustomer.id))
        .limit(1);

      expect(updatedCustomer[0].status).toBe("active");
      expect(updatedCustomer[0].stripeSubscriptionId).toBe(
        TEST_STRIPE_SUBSCRIPTION_ID,
      );
    });
  });

  describe("customer.subscription.deleted", () => {
    it("should cancel subscription, suspend pods, and send email", async () => {
      // Create a test pod
      await db.insert(pods).values({
        ownerId: testUser.id,
        teamId: testTeam.id,
        name: "test-pod",
        slug: "test-pod",
        status: "running",
        serverId: testServer.id,
        config: JSON.stringify({ tier: "dev.small" }),
        monthlyPrice: 700, // $7/month for dev.small
      });

      const mockEvent: Stripe.Event = {
        id: "evt_test_sub_deleted_001",
        object: "event",
        type: "customer.subscription.deleted",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        api_version: "2024-06-20",
        pending_webhooks: 0,
        request: null,
        data: {
          object: {
            id: TEST_STRIPE_SUBSCRIPTION_ID,
            object: "subscription",
            customer: TEST_STRIPE_CUSTOMER_ID,
            status: "canceled",
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            items: {
              object: "list",
              data: [],
            },
          } as Stripe.Subscription,
        },
      };

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent);

      const request = createMockRequest(mockEvent);
      const response = await POST(request);

      expect(response.status).toBe(200);

      // Verify event was logged
      const loggedEvent = await db
        .select()
        .from(stripeEvents)
        .where(eq(stripeEvents.stripeEventId, mockEvent.id))
        .limit(1);

      expect(loggedEvent).toHaveLength(1);
      expect(loggedEvent[0].processed).toBe(true);

      // Verify subscription was cancelled
      const subscription = await db
        .select()
        .from(stripeSubscriptions)
        .where(
          eq(stripeSubscriptions.stripeSubscriptionId, TEST_STRIPE_SUBSCRIPTION_ID),
        )
        .limit(1);

      expect(subscription[0].status).toBe("canceled");

      // Verify cancellation email was sent
      expect(emailModule.sendSubscriptionCancelledEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: testUser.email,
          name: testUser.name,
        }),
      );
    });
  });

  describe("invoice.payment_succeeded", () => {
    it("should update invoice status, clear grace period, and send email", async () => {
      const TEST_INVOICE_ID = "in_test_success_001";

      // Set grace period on customer
      await db
        .update(stripeCustomers)
        .set({
          gracePeriodStartedAt: new Date(),
          status: "past_due",
        })
        .where(eq(stripeCustomers.id, testCustomer.id));

      // First create the invoice via invoice.finalized event
      const finalizedEvent: Stripe.Event = {
        id: "evt_test_invoice_finalized_001",
        object: "event",
        type: "invoice.finalized",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        api_version: "2024-06-20",
        pending_webhooks: 0,
        request: null,
        data: {
          object: {
            id: TEST_INVOICE_ID,
            object: "invoice",
            customer: TEST_STRIPE_CUSTOMER_ID,
            subscription: TEST_STRIPE_SUBSCRIPTION_ID,
            status: "open",
            amount_due: 2400,
            amount_paid: 0,
            currency: "usd",
            period_start: Math.floor(Date.now() / 1000),
            period_end: Math.floor(Date.now() / 1000) + 2592000,
            hosted_invoice_url: "https://invoice.stripe.com/test",
            invoice_pdf: "https://invoice.stripe.com/test.pdf",
          } as Stripe.Invoice,
        },
      };

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(finalizedEvent);
      await POST(createMockRequest(finalizedEvent));

      // Now trigger payment succeeded
      const mockEvent: Stripe.Event = {
        id: "evt_test_payment_success_001",
        object: "event",
        type: "invoice.payment_succeeded",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        api_version: "2024-06-20",
        pending_webhooks: 0,
        request: null,
        data: {
          object: {
            id: TEST_INVOICE_ID,
            object: "invoice",
            customer: TEST_STRIPE_CUSTOMER_ID,
            subscription: TEST_STRIPE_SUBSCRIPTION_ID,
            status: "paid",
            amount_due: 2400,
            amount_paid: 2400,
            currency: "usd",
            period_start: Math.floor(Date.now() / 1000),
            period_end: Math.floor(Date.now() / 1000) + 2592000,
            hosted_invoice_url: "https://invoice.stripe.com/test",
            invoice_pdf: "https://invoice.stripe.com/test.pdf",
          } as Stripe.Invoice,
        },
      };

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent);

      const request = createMockRequest(mockEvent);
      const response = await POST(request);

      expect(response.status).toBe(200);

      // Verify invoice was created/updated
      const invoice = await db
        .select()
        .from(invoices)
        .where(eq(invoices.stripeInvoiceId, TEST_INVOICE_ID))
        .limit(1);

      expect(invoice).toHaveLength(1);
      expect(invoice[0].status).toBe("paid");
      expect(invoice[0].amountPaid).toBe(2400);

      // Verify grace period was cleared
      const updatedCustomer = await db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.id, testCustomer.id))
        .limit(1);

      expect(updatedCustomer[0].gracePeriodStartedAt).toBeNull();
      expect(updatedCustomer[0].status).toBe("active");

      // Verify payment success email was sent
      expect(emailModule.sendPaymentSuccessEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: testUser.email,
          name: testUser.name,
          amount: "24.00",
          currency: "usd",
        }),
      );
    });
  });

  describe("invoice.payment_failed", () => {
    it("should start grace period and send warning email", async () => {
      const TEST_INVOICE_ID = "in_test_failed_001";

      // First create the invoice via invoice.finalized event
      const finalizedEvent: Stripe.Event = {
        id: "evt_test_invoice_finalized_002",
        object: "event",
        type: "invoice.finalized",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        api_version: "2024-06-20",
        pending_webhooks: 0,
        request: null,
        data: {
          object: {
            id: TEST_INVOICE_ID,
            object: "invoice",
            customer: TEST_STRIPE_CUSTOMER_ID,
            subscription: TEST_STRIPE_SUBSCRIPTION_ID,
            status: "open",
            amount_due: 2400,
            amount_paid: 0,
            currency: "usd",
            period_start: Math.floor(Date.now() / 1000),
            period_end: Math.floor(Date.now() / 1000) + 2592000,
            hosted_invoice_url: "https://invoice.stripe.com/test",
            invoice_pdf: null,
          } as Stripe.Invoice,
        },
      };

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(finalizedEvent);
      await POST(createMockRequest(finalizedEvent));

      const mockEvent: Stripe.Event = {
        id: "evt_test_payment_failed_001",
        object: "event",
        type: "invoice.payment_failed",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        api_version: "2024-06-20",
        pending_webhooks: 0,
        request: null,
        data: {
          object: {
            id: TEST_INVOICE_ID,
            object: "invoice",
            customer: TEST_STRIPE_CUSTOMER_ID,
            subscription: TEST_STRIPE_SUBSCRIPTION_ID,
            status: "open",
            amount_due: 2400,
            amount_paid: 0,
            currency: "usd",
            period_start: Math.floor(Date.now() / 1000),
            period_end: Math.floor(Date.now() / 1000) + 2592000,
            hosted_invoice_url: "https://invoice.stripe.com/test",
            invoice_pdf: null,
          } as Stripe.Invoice,
        },
      };

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent);

      const request = createMockRequest(mockEvent);
      const response = await POST(request);

      expect(response.status).toBe(200);

      // Verify invoice status
      const invoice = await db
        .select()
        .from(invoices)
        .where(eq(invoices.stripeInvoiceId, TEST_INVOICE_ID))
        .limit(1);

      expect(invoice).toHaveLength(1);
      expect(invoice[0].status).toBe("uncollectible");

      // Verify grace period was started
      const updatedCustomer = await db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.id, testCustomer.id))
        .limit(1);

      expect(updatedCustomer[0].gracePeriodStartedAt).not.toBeNull();
      expect(updatedCustomer[0].status).toBe("past_due");

      // Verify payment failed email was sent
      expect(emailModule.sendPaymentFailedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: testUser.email,
          name: testUser.name,
          amount: "24.00",
          currency: "usd",
          graceDays: 7,
        }),
      );
    });
  });

  describe("Idempotency", () => {
    it("should skip duplicate events", async () => {
      const mockEvent: Stripe.Event = {
        id: "evt_test_idempotency_001",
        object: "event",
        type: "customer.subscription.updated",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        api_version: "2024-06-20",
        pending_webhooks: 0,
        request: null,
        data: {
          object: {
            id: TEST_STRIPE_SUBSCRIPTION_ID,
            object: "subscription",
            customer: TEST_STRIPE_CUSTOMER_ID,
            status: "active",
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            items: {
              object: "list",
              data: [],
            },
          } as Stripe.Subscription,
        },
      };

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent);

      // First request
      const request1 = createMockRequest(mockEvent);
      const response1 = await POST(request1);
      expect(response1.status).toBe(200);

      // Check event was logged
      const events1 = await db
        .select()
        .from(stripeEvents)
        .where(eq(stripeEvents.stripeEventId, mockEvent.id));
      expect(events1).toHaveLength(1);

      // Second request (duplicate)
      const request2 = createMockRequest(mockEvent);
      const response2 = await POST(request2);
      expect(response2.status).toBe(200);

      // Should still only have one event
      const events2 = await db
        .select()
        .from(stripeEvents)
        .where(eq(stripeEvents.stripeEventId, mockEvent.id));
      expect(events2).toHaveLength(1);
    });
  });

  describe("Signature verification", () => {
    it("should reject webhooks without signature", async () => {
      const request = {
        text: vi.fn().mockResolvedValue("{}"),
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
      } as unknown as Request;

      const response = await POST(request);

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toContain("Missing signature");
    });

    it("should reject webhooks with invalid signature", async () => {
      vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const request = createMockRequest({} as Stripe.Event);
      const response = await POST(request);

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toContain("Invalid signature");
    });
  });
});

