import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  invoices,
  stripePrices,
  stripeCustomers,
  usageRecords,
  users,
} from "../../db/schema";
import { stripe } from "../../stripe";
import { generateKSUID } from "../../utils";
import { createTRPCRouter, protectedProcedure } from "../server";
import type { TierId } from "../../pod-orchestration/resource-tier-registry";

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
      let customer = await ctx.db
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
   * Get current usage and estimated cost for current billing period
   */
  getCurrentUsage: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Get customer to determine currency
    const customer = await ctx.db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, userId))
      .limit(1);

    if (customer.length === 0) {
      return {
        totalHours: 0,
        estimatedCost: 0,
        currency: "usd",
        usageByTier: [],
      };
    }

    const stripeCustomer = customer[0];
    const currency = stripeCustomer.currency;

    // Get current billing period start (first day of current month)
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get all usage records for current period
    const usage = await ctx.db
      .select({
        tierId: usageRecords.tierId,
        totalHours: sql<number>`SUM(${usageRecords.quantity})`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.userId, userId),
          gte(usageRecords.periodStart, periodStart),
        ),
      )
      .groupBy(usageRecords.tierId);

    // Get prices for each tier
    const prices = await ctx.db
      .select()
      .from(stripePrices)
      .where(and(eq(stripePrices.currency, currency), eq(stripePrices.active, true)));

    const priceMap = new Map(
      prices.map((p) => [p.tierId, parseFloat(p.unitAmountDecimal) / 100]),
    );

    // Calculate cost for each tier
    const usageByTier = usage.map((u) => {
      const hourlyRate = priceMap.get(u.tierId as TierId) || 0;
      const cost = u.totalHours * hourlyRate;

      return {
        tierId: u.tierId,
        hours: u.totalHours,
        hourlyRate,
        cost,
      };
    });

    const totalHours = usageByTier.reduce((sum, u) => sum + u.hours, 0);
    const estimatedCost = usageByTier.reduce((sum, u) => sum + u.cost, 0);

    return {
      totalHours,
      estimatedCost,
      currency,
      usageByTier,
      periodStart,
    };
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

  /**
   * Get detailed billing summary
   */
  getBillingSummary: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Get customer and subscription info
    const customer = await ctx.db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, userId))
      .limit(1);

    if (customer.length === 0) {
      return {
        hasSubscription: false,
        status: null,
        nextBillingDate: null,
        currentUsage: null,
        recentInvoices: [],
      };
    }

    const stripeCustomer = customer[0];

    // Get subscription details from Stripe
    let subscriptionDetails = null;
    if (stripeCustomer.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(
          stripeCustomer.stripeSubscriptionId,
        );

        subscriptionDetails = {
          id: subscription.id,
          status: subscription.status,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        };
      } catch (error) {
        console.error("Failed to fetch subscription from Stripe:", error);
      }
    }

    // Get current usage
    const now = new Date();
    const periodStart = subscriptionDetails?.currentPeriodStart || new Date(now.getFullYear(), now.getMonth(), 1);

    const usage = await ctx.db
      .select({
        tierId: usageRecords.tierId,
        totalHours: sql<number>`SUM(${usageRecords.quantity})`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.userId, userId),
          gte(usageRecords.periodStart, periodStart),
        ),
      )
      .groupBy(usageRecords.tierId);

    // Get prices
    const prices = await ctx.db
      .select()
      .from(stripePrices)
      .where(
        and(
          eq(stripePrices.currency, stripeCustomer.currency),
          eq(stripePrices.active, true),
        ),
      );

    const priceMap = new Map(
      prices.map((p) => [p.tierId, parseFloat(p.unitAmountDecimal) / 100]),
    );

    const usageByTier = usage.map((u) => ({
      tierId: u.tierId,
      hours: u.totalHours,
      hourlyRate: priceMap.get(u.tierId as TierId) || 0,
      cost: u.totalHours * (priceMap.get(u.tierId as TierId) || 0),
    }));

    const totalHours = usageByTier.reduce((sum, u) => sum + u.hours, 0);
    const estimatedCost = usageByTier.reduce((sum, u) => sum + u.cost, 0);

    // Get recent invoices
    const recentInvoices = await ctx.db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, userId))
      .orderBy(desc(invoices.createdAt))
      .limit(5);

    return {
      hasSubscription: !!stripeCustomer.stripeSubscriptionId,
      status: stripeCustomer.status,
      customerId: stripeCustomer.stripeCustomerId,
      currency: stripeCustomer.currency,
      gracePeriodStartedAt: stripeCustomer.gracePeriodStartedAt,
      subscription: subscriptionDetails,
      currentUsage: {
        totalHours,
        estimatedCost,
        usageByTier,
        periodStart,
      },
      recentInvoices,
    };
  }),
});

