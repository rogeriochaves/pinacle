import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { db } from "../../../../lib/db";
import {
  invoices,
  stripeCustomers,
  stripeEvents,
  users,
} from "../../../../lib/db/schema";
import {
  activateSubscription,
  cancelSubscription,
  createOrUpdateSubscriptionRecord,
  handlePaymentFailure,
  handlePaymentSuccess,
  pauseSubscription,
  resumeSubscription,
  updateSubscription,
} from "../../../../lib/billing/subscription-service";
import {
  sendPaymentFailedEmail,
  sendPaymentSuccessEmail,
  sendSubscriptionCancelledEmail,
} from "../../../../lib/email";
import { stripe } from "../../../../lib/stripe";
import { generateKSUID } from "../../../../lib/utils";

/**
 * Stripe Webhook Handler
 * Handles all Stripe webhook events for billing
 * POST /api/webhooks/stripe
 */

/**
 * Log webhook event to database for idempotency and auditing
 */
const logWebhookEvent = async (event: Stripe.Event): Promise<boolean> => {
  // Check if event already processed
  const existing = await db
    .select()
    .from(stripeEvents)
    .where(eq(stripeEvents.stripeEventId, event.id))
    .limit(1);

  if (existing.length > 0) {
    console.log(`[Webhook] Event ${event.id} already processed, skipping`);
    return false; // Already processed
  }

  // Log event
  await db.insert(stripeEvents).values({
    id: generateKSUID("stripe_event"),
    stripeEventId: event.id,
    eventType: event.type,
    processed: false,
    data: JSON.stringify(event),
    createdAt: new Date(),
  });

  return true; // New event
};

/**
 * Mark event as processed
 */
const markEventProcessed = async (eventId: string, error?: string) => {
  await db
    .update(stripeEvents)
    .set({
      processed: !error,
      processingError: error || null,
      processedAt: new Date(),
    })
    .where(eq(stripeEvents.stripeEventId, eventId));
};

/**
 * Get user info from Stripe customer ID
 */
const getUserFromCustomerId = async (stripeCustomerId: string) => {
  const customer = await db
    .select()
    .from(stripeCustomers)
    .where(eq(stripeCustomers.stripeCustomerId, stripeCustomerId))
    .limit(1);

  if (customer.length === 0) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, customer[0].userId))
    .limit(1);

  return user.length > 0 ? { ...user[0], customer: customer[0] } : null;
};

/**
 * Handle subscription events
 */
const handleSubscriptionEvent = async (
  event: Stripe.Event,
): Promise<void> => {
  const subscription = event.data.object as Stripe.Subscription;

  switch (event.type) {
    case "customer.subscription.created":
      console.log(`[Webhook] Subscription created: ${subscription.id}`);
      await activateSubscription(subscription);
      break;

    case "customer.subscription.updated":
      console.log(`[Webhook] Subscription updated: ${subscription.id}`);
      await updateSubscription(subscription);
      break;

    case "customer.subscription.deleted":
      console.log(`[Webhook] Subscription deleted: ${subscription.id}`);
      await cancelSubscription(subscription);

      // Send cancellation email
      try {
        const customerId = typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id;

        if (customerId) {
          const userInfo = await getUserFromCustomerId(customerId);
          if (userInfo) {
            const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
            await sendSubscriptionCancelledEmail({
              to: userInfo.email,
              name: userInfo.name || "there",
              billingUrl: `${baseUrl}/dashboard/billing`,
              dataRetentionDays: 30,
            });
          }
        }
      } catch (error) {
        console.error("[Webhook] Failed to send cancellation email:", error);
      }
      break;

    case "customer.subscription.paused":
      console.log(`[Webhook] Subscription paused: ${subscription.id}`);
      await pauseSubscription(subscription);
      break;

    case "customer.subscription.resumed":
      console.log(`[Webhook] Subscription resumed: ${subscription.id}`);
      await resumeSubscription(subscription);
      break;

    case "customer.subscription.pending_update_applied":
      console.log(`[Webhook] Subscription pending update applied: ${subscription.id}`);
      await updateSubscription(subscription);
      break;

    case "customer.subscription.pending_update_expired":
      console.log(`[Webhook] Subscription pending update expired: ${subscription.id}`);
      // Just log, no action needed
      break;

    default:
      console.log(`[Webhook] Unhandled subscription event: ${event.type}`);
  }
};

/**
 * Handle invoice events
 */
const handleInvoiceEvent = async (event: Stripe.Event): Promise<void> => {
  const invoice = event.data.object as Stripe.Invoice;

  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id;

  const subscriptionId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id;

  switch (event.type) {
    case "invoice.created":
      console.log(`[Webhook] Invoice created: ${invoice.id}`);
      // Invoice is created but not yet finalized
      break;

    case "invoice.finalized":
      console.log(`[Webhook] Invoice finalized: ${invoice.id}`);
      // Save invoice to database
      if (customerId) {
        // Look up userId from customer
        const customer = await db
          .select()
          .from(stripeCustomers)
          .where(eq(stripeCustomers.stripeCustomerId, customerId))
          .limit(1);

        if (customer.length === 0) {
          console.log(
            `[Webhook] No customer found for ${customerId}, skipping invoice save`,
          );
          break;
        }

        const existing = await db
          .select()
          .from(invoices)
          .where(eq(invoices.stripeInvoiceId, invoice.id))
          .limit(1);

        const invoiceData = {
          stripeInvoiceId: invoice.id,
          userId: customer[0].userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId || null,
          status: invoice.status || "draft",
          amountDue: invoice.amount_due,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          periodStart: invoice.period_start
            ? new Date(invoice.period_start * 1000)
            : null,
          periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
          hostedInvoiceUrl: invoice.hosted_invoice_url,
          invoicePdfUrl: invoice.invoice_pdf,
          updatedAt: new Date(),
        };

        if (existing.length > 0) {
          await db
            .update(invoices)
            .set(invoiceData)
            .where(eq(invoices.stripeInvoiceId, invoice.id));
        } else {
          await db.insert(invoices).values({
            id: generateKSUID("invoice"),
            ...invoiceData,
            createdAt: new Date(),
          });
        }
      }
      break;

    case "invoice.payment_succeeded":
      console.log(`[Webhook] Payment succeeded for invoice: ${invoice.id}`);
      if (customerId) {
        await handlePaymentSuccess(customerId);

        // Update invoice status
        await db
          .update(invoices)
          .set({
            status: "paid",
            amountPaid: invoice.amount_paid,
            updatedAt: new Date(),
          })
          .where(eq(invoices.stripeInvoiceId, invoice.id));

        // Send payment success email
        try {
          const userInfo = await getUserFromCustomerId(customerId);
          if (userInfo) {
            const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
            const amount = (invoice.amount_paid / 100).toFixed(2);
            await sendPaymentSuccessEmail({
              to: userInfo.email,
              name: userInfo.name || "there",
              amount,
              currency: invoice.currency,
              invoiceUrl: invoice.hosted_invoice_url || `${baseUrl}/dashboard/billing`,
              billingUrl: `${baseUrl}/dashboard/billing`,
            });
          }
        } catch (error) {
          console.error("[Webhook] Failed to send payment success email:", error);
        }
      }
      break;

    case "invoice.payment_failed":
      console.log(`[Webhook] Payment failed for invoice: ${invoice.id}`);
      if (customerId) {
        await handlePaymentFailure(customerId);

        // Update invoice status
        await db
          .update(invoices)
          .set({
            status: "uncollectible",
            updatedAt: new Date(),
          })
          .where(eq(invoices.stripeInvoiceId, invoice.id));

        // Send payment failed email
        try {
          const userInfo = await getUserFromCustomerId(customerId);
          if (userInfo) {
            const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
            const amount = (invoice.amount_due / 100).toFixed(2);
            await sendPaymentFailedEmail({
              to: userInfo.email,
              name: userInfo.name || "there",
              amount,
              currency: invoice.currency,
              billingUrl: `${baseUrl}/dashboard/billing`,
              graceDays: 7,
            });
          }
        } catch (error) {
          console.error("[Webhook] Failed to send payment failed email:", error);
        }
      }
      break;

    default:
      console.log(`[Webhook] Unhandled invoice event: ${event.type}`);
  }
};

/**
 * Main webhook handler
 */
export const POST = async (req: NextRequest) => {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    console.error("[Webhook] Missing Stripe signature");
    return new Response("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || "",
    );
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err);
    return new Response(`Webhook Error: ${err instanceof Error ? err.message : "Unknown error"}`, {
      status: 400,
    });
  }

  console.log(`[Webhook] Received event: ${event.type} (${event.id})`);

  try {
    // Check if event already processed (idempotency)
    const isNewEvent = await logWebhookEvent(event);

    if (!isNewEvent) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle event based on type
    if (event.type.startsWith("customer.subscription.")) {
      await handleSubscriptionEvent(event);
    } else if (event.type.startsWith("invoice.")) {
      await handleInvoiceEvent(event);
    } else {
      console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    await markEventProcessed(event.id);

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[Webhook] Error processing event ${event.id}:`, error);

    // Mark event with error
    await markEventProcessed(
      event.id,
      error instanceof Error ? error.message : "Unknown error",
    );

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};

