import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "../db";
import { stripeCustomers, stripeSubscriptions } from "../db/schema";
import { generateKSUID } from "../utils";
import { resumeUserPods, suspendUserPods } from "./pod-suspension";

/**
 * Subscription service for managing Stripe subscriptions
 * Handles subscription lifecycle events from webhooks
 */

/**
 * Create or update Stripe customer record
 */
export const createOrUpdateStripeCustomer = async (
  userId: string,
  stripeCustomerId: string,
  stripeSubscriptionId?: string,
) => {
  const existing = await db
    .select()
    .from(stripeCustomers)
    .where(eq(stripeCustomers.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    // Update existing
    await db
      .update(stripeCustomers)
      .set({
        stripeCustomerId,
        stripeSubscriptionId:
          stripeSubscriptionId || existing[0].stripeSubscriptionId,
        updatedAt: new Date(),
      })
      .where(eq(stripeCustomers.userId, userId));

    return existing[0];
  }

  // Create new
  const result = await db
    .insert(stripeCustomers)
    .values({
      id: generateKSUID("stripe_customer"),
      userId,
      stripeCustomerId,
      stripeSubscriptionId,
      status: "active",
      currency: "usd",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return result[0];
};

/**
 * Activate subscription (after successful checkout)
 */
export const activateSubscription = async (
  subscription: Stripe.Subscription,
): Promise<void> => {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  // Find user by Stripe customer ID
  const customer = await db
    .select()
    .from(stripeCustomers)
    .where(eq(stripeCustomers.stripeCustomerId, customerId))
    .limit(1);

  if (customer.length === 0) {
    throw new Error(`No customer found for Stripe customer ID: ${customerId}`);
  }

  const userId = customer[0].userId;

  // Update customer record
  await db
    .update(stripeCustomers)
    .set({
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      gracePeriodStartedAt: null, // Clear grace period
      updatedAt: new Date(),
    })
    .where(eq(stripeCustomers.userId, userId));

  // Create or update subscription record
  await createOrUpdateSubscriptionRecord(subscription, userId);

  console.log(
    `[SubscriptionService] Activated subscription for user ${userId}`,
  );
};

/**
 * Create or update subscription record
 */
export const createOrUpdateSubscriptionRecord = async (
  subscription: Stripe.Subscription,
  userId: string,
): Promise<void> => {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const existing = await db
    .select()
    .from(stripeSubscriptions)
    .where(eq(stripeSubscriptions.stripeSubscriptionId, subscription.id))
    .limit(1);

  // Get period dates from first subscription item (Stripe API change: these moved from Subscription to SubscriptionItem)
  const firstItem = subscription.items?.data?.[0];
  if (!firstItem) {
    throw new Error(
      `Subscription ${subscription.id} has no items - cannot determine billing period`,
    );
  }
  if (!firstItem.current_period_start || !firstItem.current_period_end) {
    throw new Error(
      `Subscription item ${firstItem.id} is missing current_period_start or current_period_end`,
    );
  }

  const currentPeriodStart = new Date(firstItem.current_period_start * 1000);
  const currentPeriodEnd = new Date(firstItem.current_period_end * 1000);

  const data = {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId,
    userId,
    status: subscription.status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000)
      : null,
    trialStart: subscription.trial_start
      ? new Date(subscription.trial_start * 1000)
      : null,
    trialEnd: subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null,
    metadata: JSON.stringify(subscription.metadata),
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db
      .update(stripeSubscriptions)
      .set(data)
      .where(eq(stripeSubscriptions.stripeSubscriptionId, subscription.id));
  } else {
    await db.insert(stripeSubscriptions).values({
      id: generateKSUID("stripe_subscription"),
      ...data,
      createdAt: new Date(),
    });
  }
};

/**
 * Update subscription status
 */
export const updateSubscription = async (
  subscription: Stripe.Subscription,
): Promise<void> => {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  // Update customer status
  await db
    .update(stripeCustomers)
    .set({
      status: subscription.status,
      updatedAt: new Date(),
    })
    .where(eq(stripeCustomers.stripeCustomerId, customerId));

  // Update subscription record
  const customer = await db
    .select()
    .from(stripeCustomers)
    .where(eq(stripeCustomers.stripeCustomerId, customerId))
    .limit(1);

  if (customer.length > 0) {
    await createOrUpdateSubscriptionRecord(subscription, customer[0].userId);
  }

  console.log(`[SubscriptionService] Updated subscription ${subscription.id}`);
};

/**
 * Cancel subscription
 */
export const cancelSubscription = async (
  subscription: Stripe.Subscription,
): Promise<void> => {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  // Update customer status
  await db
    .update(stripeCustomers)
    .set({
      status: "canceled",
      updatedAt: new Date(),
    })
    .where(eq(stripeCustomers.stripeCustomerId, customerId));

  // Update subscription record
  const customer = await db
    .select()
    .from(stripeCustomers)
    .where(eq(stripeCustomers.stripeCustomerId, customerId))
    .limit(1);

  if (customer.length > 0) {
    await createOrUpdateSubscriptionRecord(subscription, customer[0].userId);

    // Suspend all user pods
    await suspendUserPods(customer[0].userId);
  }

  console.log(
    `[SubscriptionService] Cancelled subscription ${subscription.id}`,
  );
};

/**
 * Pause subscription
 */
export const pauseSubscription = async (
  subscription: Stripe.Subscription,
): Promise<void> => {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  // Update customer status
  await db
    .update(stripeCustomers)
    .set({
      status: "paused",
      updatedAt: new Date(),
    })
    .where(eq(stripeCustomers.stripeCustomerId, customerId));

  // Update subscription record
  const customer = await db
    .select()
    .from(stripeCustomers)
    .where(eq(stripeCustomers.stripeCustomerId, customerId))
    .limit(1);

  if (customer.length > 0) {
    await createOrUpdateSubscriptionRecord(subscription, customer[0].userId);

    // Suspend all user pods
    await suspendUserPods(customer[0].userId);
  }

  console.log(`[SubscriptionService] Paused subscription ${subscription.id}`);
};

/**
 * Resume subscription
 */
export const resumeSubscription = async (
  subscription: Stripe.Subscription,
): Promise<void> => {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  // Update customer status
  await db
    .update(stripeCustomers)
    .set({
      status: "active",
      gracePeriodStartedAt: null, // Clear grace period
      updatedAt: new Date(),
    })
    .where(eq(stripeCustomers.stripeCustomerId, customerId));

  // Update subscription record
  const customer = await db
    .select()
    .from(stripeCustomers)
    .where(eq(stripeCustomers.stripeCustomerId, customerId))
    .limit(1);

  if (customer.length > 0) {
    await createOrUpdateSubscriptionRecord(subscription, customer[0].userId);

    // Resume user pods
    await resumeUserPods(customer[0].userId);
  }

  console.log(`[SubscriptionService] Resumed subscription ${subscription.id}`);
};

/**
 * Handle payment failure
 */
export const handlePaymentFailure = async (
  customerId: string,
): Promise<void> => {
  // Update customer status and start grace period
  await db
    .update(stripeCustomers)
    .set({
      status: "past_due",
      gracePeriodStartedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(stripeCustomers.stripeCustomerId, customerId));

  console.log(
    `[SubscriptionService] Started grace period for customer ${customerId}`,
  );
};

/**
 * Handle payment success
 */
export const handlePaymentSuccess = async (
  customerId: string,
): Promise<void> => {
  // Update customer status and clear grace period
  await db
    .update(stripeCustomers)
    .set({
      status: "active",
      gracePeriodStartedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(stripeCustomers.stripeCustomerId, customerId));

  console.log(
    `[SubscriptionService] Payment succeeded for customer ${customerId}`,
  );
};
