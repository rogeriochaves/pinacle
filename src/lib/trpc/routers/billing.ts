import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  invoices,
  stripeCustomers,
  stripePrices,
  usageRecords,
  users,
} from "../../db/schema";
import type { TierId } from "../../pod-orchestration/resource-tier-registry";
import { stripe } from "../../stripe";
import { generateKSUID } from "../../utils";
import { createTRPCRouter, protectedProcedure } from "../server";

export const billingRouter = createTRPCRouter({
  /**
   * Get subscription status for current user
   */
  getSubscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const customer = await ctx.db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, userId))
      .limit(1);

    if (customer.length === 0) {
      return {
        hasSubscription: false,
        status: null,
        customerId: null,
      };
    }

    const stripeCustomer = customer[0];

    return {
      hasSubscription: !!stripeCustomer.stripeSubscriptionId,
      status: stripeCustomer.status,
      customerId: stripeCustomer.stripeCustomerId,
      gracePeriodStartedAt: stripeCustomer.gracePeriodStartedAt,
      currency: stripeCustomer.currency,
    };
  }),

  /**
   * Create Stripe Checkout Session for subscription
   */
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        tierId: z.string(),
        currency: z.enum(["usd", "eur", "brl"]).optional().default("usd"),
        successUrl: z.string().optional(),
        cancelUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { tierId, currency, successUrl, cancelUrl } = input;

      // Get or create Stripe customer
      const customer = await ctx.db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.userId, userId))
        .limit(1);

      let stripeCustomerId: string;

      if (customer.length === 0) {
        // Get user details
        const user = await ctx.db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (user.length === 0) {
          throw new Error("User not found");
        }

        // Create Stripe customer
        const stripeCustomer = await stripe.customers.create({
          email: user[0].email,
          name: user[0].name || undefined,
          metadata: {
            userId: userId,
          },
        });

        stripeCustomerId = stripeCustomer.id;

        // Save to database
        await ctx.db.insert(stripeCustomers).values({
          id: generateKSUID("stripe_customer"),
          userId: userId,
          stripeCustomerId: stripeCustomerId,
          currency: currency,
          status: "inactive",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        stripeCustomerId = customer[0].stripeCustomerId;
      }

      // Get price for tier and currency
      const price = await ctx.db
        .select()
        .from(stripePrices)
        .where(
          and(
            eq(stripePrices.tierId, tierId as TierId),
            eq(stripePrices.currency, currency),
            eq(stripePrices.active, true),
          ),
        )
        .limit(1);

      if (price.length === 0) {
        throw new Error(`Price not found for tier ${tierId} in ${currency}`);
      }

      const stripePriceId = price[0].stripePriceId;

      // Create checkout session
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: "subscription",
        line_items: [
          {
            price: stripePriceId,
          },
        ],
        success_url: successUrl || `${baseUrl}/dashboard?checkout=success`,
        cancel_url: cancelUrl || `${baseUrl}/setup?checkout=cancel`,
        billing_address_collection: "auto",
        payment_method_collection: "always",
        allow_promotion_codes: true,
        metadata: {
          userId: userId,
          tierId: tierId,
          currency: currency,
        },
      });

      return {
        sessionId: session.id,
        url: session.url,
      };
    }),

  /**
   * Handle successful checkout - verify session and return subscription status
   */
  handleCheckoutSuccess: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { sessionId } = input;

      // Retrieve the checkout session from Stripe
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription", "customer"],
      });

      // Log for debugging
      console.log(`[handleCheckoutSuccess] Session status:`, {
        id: session.id,
        payment_status: session.payment_status,
        status: session.status,
        subscription: !!session.subscription,
        customer: session.customer,
      });

      // Check if session has a subscription (payment might still be processing)
      if (!session.subscription) {
        throw new Error("Subscription not created yet. Please wait a moment.");
      }

      // For usage-based subscriptions with no immediate charge, status might be:
      // - "paid": Payment completed (one-time charge)
      // - "unpaid": Payment pending or no immediate payment
      // - "no_payment_required": No payment needed (common for metered billing)
      // We accept all since webhook handles the actual subscription activation
      const validStatuses = ["paid", "unpaid", "no_payment_required"];
      if (!validStatuses.includes(session.payment_status)) {
        console.error(
          `[handleCheckoutSuccess] Invalid payment status: ${session.payment_status}`,
        );
        throw new Error(`Invalid payment status: ${session.payment_status}`);
      }

      // Extract customer ID from session (might be string or expanded object)
      const sessionCustomerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;

      if (!sessionCustomerId) {
        throw new Error("No customer associated with checkout session");
      }

      // Verify the session belongs to this user
      // First check our database
      const customer = await ctx.db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.userId, userId))
        .limit(1);

      // If customer exists in DB, verify it matches the session
      if (customer.length > 0) {
        if (customer[0].stripeCustomerId !== sessionCustomerId) {
          console.error(
            `[handleCheckoutSuccess] Customer mismatch: DB=${customer[0].stripeCustomerId}, Session=${sessionCustomerId}`,
          );
          throw new Error("Session does not belong to current user");
        }
        return {
          success: true,
          subscriptionId:
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id,
          status: customer[0].status,
        };
      }

      // Customer not in DB yet (webhook race condition) - verify via Stripe customer metadata
      const stripeCustomer = await stripe.customers.retrieve(sessionCustomerId);

      if (
        stripeCustomer.deleted ||
        stripeCustomer.metadata?.userId !== userId
      ) {
        throw new Error("Session does not belong to current user");
      }

      // Customer is valid but not in DB yet - wait for webhook to process
      // Return success so user can proceed
      return {
        success: true,
        subscriptionId:
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id,
        status: "active", // Assume active since payment was successful
      };
    }),

  /**
   * Create Stripe Customer Portal session
   */
  createPortalSession: protectedProcedure
    .input(
      z.object({
        returnUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { returnUrl } = input;

      const customer = await ctx.db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.userId, userId))
        .limit(1);

      if (customer.length === 0) {
        throw new Error("No Stripe customer found for user");
      }

      const stripeCustomer = customer[0];

      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomer.stripeCustomerId,
        return_url: returnUrl || `${baseUrl}/dashboard/billing`,
      });

      return {
        url: portalSession.url,
      };
    }),

  /**
   * Get current usage and cost from Stripe (source of truth)
   * Fetches the upcoming invoice to show accurate billing data
   */
  getCurrentUsage: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Get customer
    const customer = await ctx.db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, userId))
      .limit(1);

    if (customer.length === 0) {
      return {
        upcomingInvoice: null,
        message: "No active subscription",
      };
    }

    const stripeCustomer = customer[0];

    // Need subscription ID for preview invoice API
    if (!stripeCustomer.stripeSubscriptionId) {
      return {
        upcomingInvoice: null,
        message: "No active subscription",
      };
    }

    try {
      // Fetch upcoming invoice from Stripe (source of truth)
      // Using new Create Preview Invoice API (replaces retrieveUpcoming)
      const upcomingInvoice = await stripe.invoices.createPreview({
        customer: stripeCustomer.stripeCustomerId,
        subscription: stripeCustomer.stripeSubscriptionId,
      });

      // Extract line items with usage data
      const lineItems = upcomingInvoice.lines.data.map((line: {
        description: string | null;
        amount: number;
        currency: string;
        quantity: number | null;
        period: { start: number; end: number };
        metadata: Record<string, string>;
      }) => ({
        description: line.description,
        amount: line.amount,
        currency: line.currency,
        quantity: line.quantity,
        period: {
          start: line.period.start,
          end: line.period.end,
        },
        // Extract tier info from metadata if available
        metadata: line.metadata,
      }));

      return {
        upcomingInvoice: {
          subtotal: upcomingInvoice.subtotal,
          total: upcomingInvoice.total,
          currency: upcomingInvoice.currency,
          periodStart: upcomingInvoice.period_start,
          periodEnd: upcomingInvoice.period_end,
          lineItems,
        },
        message: null,
      };
    } catch (error: unknown) {
      // If no upcoming invoice (e.g., no active subscription), return gracefully
      const stripeError = error as { code?: string };
      if (stripeError.code === "invoice_upcoming_none") {
        return {
          upcomingInvoice: null,
          message: "No upcoming invoice found",
        };
      }
      throw error;
    }
  }),

  /**
   * Get invoice history
   */
  getInvoiceHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(10),
        offset: z.number().min(0).optional().default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { limit, offset } = input;

      const userInvoices = await ctx.db
        .select()
        .from(invoices)
        .where(eq(invoices.userId, userId))
        .orderBy(desc(invoices.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        invoices: userInvoices,
      };
    }),

  /**
   * Get usage for a specific date range
   */
  getUsageForPeriod: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { startDate, endDate } = input;

      const usage = await ctx.db
        .select({
          tierId: usageRecords.tierId,
          podId: usageRecords.podId,
          totalHours: sql<number>`SUM(${usageRecords.quantity})`,
        })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.userId, userId),
            gte(usageRecords.periodStart, startDate),
            lte(usageRecords.periodEnd, endDate),
          ),
        )
        .groupBy(usageRecords.tierId, usageRecords.podId);

      return {
        usage,
        startDate,
        endDate,
      };
    }),

});
