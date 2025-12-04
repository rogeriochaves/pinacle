/**
 * Recovery script to restore stripeCustomers and stripeSubscriptions from checkout sessions
 *
 * Run with: pnpm tsx scripts/recover-stripe-data.ts
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  checkoutSessions,
  stripeCustomers,
  stripeSubscriptions,
  users,
} from "../src/lib/db/schema";
import { stripe } from "../src/lib/stripe";

const recoverStripeData = async () => {
  console.log("🔄 Starting Stripe data recovery...\n");

  // Get all completed checkout sessions
  const completedSessions = await db
    .select({
      id: checkoutSessions.id,
      userId: checkoutSessions.userId,
      stripeSessionId: checkoutSessions.stripeSessionId,
      status: checkoutSessions.status,
      tier: checkoutSessions.tier,
    })
    .from(checkoutSessions)
    .where(eq(checkoutSessions.status, "completed"));

  console.log(`Found ${completedSessions.length} completed checkout sessions\n`);

  let customersRecovered = 0;
  let subscriptionsRecovered = 0;
  let errors = 0;

  for (const session of completedSessions) {
    console.log(`\n📋 Processing session ${session.stripeSessionId}...`);

    try {
      // Fetch the checkout session from Stripe
      const stripeSession = await stripe.checkout.sessions.retrieve(
        session.stripeSessionId,
        {
          expand: ["subscription", "customer"],
        }
      );

      if (!stripeSession.customer) {
        console.log(`  ⚠️ No customer found for session`);
        continue;
      }

      const customerId =
        typeof stripeSession.customer === "string"
          ? stripeSession.customer
          : stripeSession.customer.id;

      const subscriptionId =
        typeof stripeSession.subscription === "string"
          ? stripeSession.subscription
          : stripeSession.subscription?.id;

      console.log(`  Customer: ${customerId}`);
      console.log(`  Subscription: ${subscriptionId || "none"}`);

      // Get user info
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);

      if (!user) {
        console.log(`  ⚠️ User ${session.userId} not found in database`);
        continue;
      }

      // Check if stripeCustomer already exists
      const existingCustomer = await db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.userId, session.userId))
        .limit(1);

      if (existingCustomer.length > 0) {
        console.log(`  ℹ️ Customer record already exists, updating...`);
        await db
          .update(stripeCustomers)
          .set({
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId || null,
            status: subscriptionId ? "active" : "inactive",
            updatedAt: new Date(),
          })
          .where(eq(stripeCustomers.userId, session.userId));
      } else {
        // Get customer details from Stripe for currency
        const stripeCustomer = await stripe.customers.retrieve(customerId);
        const currency =
          "currency" in stripeCustomer && stripeCustomer.currency
            ? stripeCustomer.currency
            : "usd";

        console.log(`  Creating customer record (currency: ${currency})...`);
        await db.insert(stripeCustomers).values({
          userId: session.userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId || null,
          status: subscriptionId ? "active" : "inactive",
          currency,
        });
        customersRecovered++;
      }

      // Handle subscription if exists
      if (subscriptionId) {
        // Check if subscription already exists
        const existingSub = await db
          .select()
          .from(stripeSubscriptions)
          .where(eq(stripeSubscriptions.stripeSubscriptionId, subscriptionId))
          .limit(1);

        if (existingSub.length > 0) {
          console.log(`  ℹ️ Subscription record already exists, updating...`);
          // Fetch latest subscription data from Stripe
          const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);

          await db
            .update(stripeSubscriptions)
            .set({
              status: stripeSub.status,
              currentPeriodStart: new Date(
                stripeSub.items.data[0]?.current_period_start
                  ? stripeSub.items.data[0].current_period_start * 1000
                  : stripeSub.created * 1000
              ),
              currentPeriodEnd: new Date(
                stripeSub.items.data[0]?.current_period_end
                  ? stripeSub.items.data[0].current_period_end * 1000
                  : stripeSub.created * 1000
              ),
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
              canceledAt: stripeSub.canceled_at
                ? new Date(stripeSub.canceled_at * 1000)
                : null,
              updatedAt: new Date(),
            })
            .where(eq(stripeSubscriptions.stripeSubscriptionId, subscriptionId));
        } else {
          // Fetch subscription details from Stripe
          const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);

          console.log(`  Creating subscription record (status: ${stripeSub.status})...`);
          await db.insert(stripeSubscriptions).values({
            stripeSubscriptionId: subscriptionId,
            stripeCustomerId: customerId,
            userId: session.userId,
            status: stripeSub.status,
            currentPeriodStart: new Date(
              stripeSub.items.data[0]?.current_period_start
                ? stripeSub.items.data[0].current_period_start * 1000
                : stripeSub.created * 1000
            ),
            currentPeriodEnd: new Date(
              stripeSub.items.data[0]?.current_period_end
                ? stripeSub.items.data[0].current_period_end * 1000
                : stripeSub.created * 1000
            ),
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
            canceledAt: stripeSub.canceled_at
              ? new Date(stripeSub.canceled_at * 1000)
              : null,
            trialStart: stripeSub.trial_start
              ? new Date(stripeSub.trial_start * 1000)
              : null,
            trialEnd: stripeSub.trial_end
              ? new Date(stripeSub.trial_end * 1000)
              : null,
            metadata: JSON.stringify(stripeSub.metadata),
          });
          subscriptionsRecovered++;
        }
      }

      console.log(`  ✅ Done`);
    } catch (error) {
      console.error(`  ❌ Error:`, error instanceof Error ? error.message : error);
      errors++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 Recovery Summary:");
  console.log(`   Customers recovered/updated: ${customersRecovered}`);
  console.log(`   Subscriptions recovered/updated: ${subscriptionsRecovered}`);
  console.log(`   Errors: ${errors}`);
  console.log("=".repeat(50) + "\n");

  // Also check if there are any customers in Stripe not covered by checkout sessions
  console.log("🔍 Checking for additional Stripe customers by user email...\n");

  const allUsers = await db.select().from(users);
  let additionalRecovered = 0;

  for (const user of allUsers) {
    if (!user.email) continue;

    // Check if we already have a customer record for this user
    const existingCustomer = await db
      .select()
      .from(stripeCustomers)
      .where(eq(stripeCustomers.userId, user.id))
      .limit(1);

    if (existingCustomer.length > 0) continue;

    // Search Stripe for customer by email
    try {
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        const stripeCustomer = customers.data[0];
        console.log(`Found Stripe customer for ${user.email}: ${stripeCustomer.id}`);

        // Get their subscriptions
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomer.id,
          status: "all",
          limit: 10,
        });

        const activeSub = subscriptions.data.find(
          (s) => s.status === "active" || s.status === "trialing"
        );

        // Create customer record
        await db.insert(stripeCustomers).values({
          userId: user.id,
          stripeCustomerId: stripeCustomer.id,
          stripeSubscriptionId: activeSub?.id || null,
          status: activeSub ? "active" : "inactive",
          currency: stripeCustomer.currency || "usd",
        });

        // Create subscription records
        for (const sub of subscriptions.data) {
          const existingSub = await db
            .select()
            .from(stripeSubscriptions)
            .where(eq(stripeSubscriptions.stripeSubscriptionId, sub.id))
            .limit(1);

          if (existingSub.length === 0) {
            await db.insert(stripeSubscriptions).values({
              stripeSubscriptionId: sub.id,
              stripeCustomerId: stripeCustomer.id,
              userId: user.id,
              status: sub.status,
              currentPeriodStart: new Date(
                sub.items.data[0]?.current_period_start
                  ? sub.items.data[0].current_period_start * 1000
                  : sub.created * 1000
              ),
              currentPeriodEnd: new Date(
                sub.items.data[0]?.current_period_end
                  ? sub.items.data[0].current_period_end * 1000
                  : sub.created * 1000
              ),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              canceledAt: sub.canceled_at
                ? new Date(sub.canceled_at * 1000)
                : null,
              trialStart: sub.trial_start
                ? new Date(sub.trial_start * 1000)
                : null,
              trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
              metadata: JSON.stringify(sub.metadata),
            });
            console.log(`  Created subscription record: ${sub.id} (${sub.status})`);
          }
        }

        additionalRecovered++;
        console.log(`  ✅ Recovered customer for ${user.email}`);
      }
    } catch (error) {
      // Silently skip users without Stripe customers
    }
  }

  console.log(`\n📊 Additional customers recovered by email: ${additionalRecovered}`);
  console.log("\n✅ Recovery complete!\n");
};

recoverStripeData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

