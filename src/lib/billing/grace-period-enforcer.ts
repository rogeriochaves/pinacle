import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "../db";
import { pods, stripeCustomers, users } from "../db/schema";
import {
  sendFinalDeletionWarningEmail,
  sendGracePeriodWarningEmail,
} from "../email";
import { podSuspensionService } from "./pod-suspension";

/**
 * Grace Period Enforcer
 * Manages grace period lifecycle for users with payment failures
 *
 * Timeline:
 * - Day 0: Payment fails, grace period starts (7 days)
 * - Day 4: Warning email (3 days remaining)
 * - Day 6: Final warning email (1 day remaining)
 * - Day 7: Pods suspended
 * - Day 14: Warning email (7 days until deletion)
 * - Day 21: Warning email (data deletion in 7 days)
 * - Day 28: All data permanently deleted
 */

const GRACE_PERIOD_DAYS = 7;
const SUSPENSION_TO_DELETION_DAYS = 21; // 3 weeks after suspension
const WARNING_DAYS = [3, 1]; // Send warnings at 3 days and 1 day remaining
const DELETION_WARNING_DAYS = [14, 7]; // Warnings before final deletion

type GracePeriodStatus = {
  userId: string;
  email: string;
  name: string | null;
  gracePeriodStartedAt: Date;
  daysInGracePeriod: number;
  shouldSuspend: boolean;
  shouldWarn: boolean;
  shouldDelete: boolean;
  shouldWarnDeletion: boolean;
  lastInvoiceAmount?: string;
  currency?: string;
};

export class GracePeriodEnforcer {
  /**
   * Check all users in grace period and take appropriate actions
   */
  async enforceGracePeriod(): Promise<void> {
    console.log("[GracePeriodEnforcer] Starting grace period enforcement...");

    // Get all customers in grace period
    const customersInGracePeriod = await db
      .select({
        customer: stripeCustomers,
        user: users,
      })
      .from(stripeCustomers)
      .innerJoin(users, eq(users.id, stripeCustomers.userId))
      .where(
        and(
          isNotNull(stripeCustomers.gracePeriodStartedAt),
          eq(stripeCustomers.status, "past_due"),
        ),
      );

    console.log(
      `[GracePeriodEnforcer] Found ${customersInGracePeriod.length} customers in grace period`,
    );

    for (const { customer, user } of customersInGracePeriod) {
      try {
        const status = await this.analyzeGracePeriodStatus(customer, user);
        await this.takeAction(status);
      } catch (error) {
        console.error(
          `[GracePeriodEnforcer] Error processing user ${user.id}:`,
          error,
        );
      }
    }

    // Also check for suspended users that should be deleted
    await this.checkForDeletion();

    console.log("[GracePeriodEnforcer] Grace period enforcement completed");
  }

  /**
   * Analyze grace period status for a customer
   */
  private async analyzeGracePeriodStatus(
    customer: typeof stripeCustomers.$inferSelect,
    user: typeof users.$inferSelect,
  ): Promise<GracePeriodStatus> {
    const now = new Date();
    const gracePeriodStart = customer.gracePeriodStartedAt!;
    const hoursSinceStart =
      (now.getTime() - gracePeriodStart.getTime()) / (1000 * 60 * 60);
    const daysInGracePeriod = Math.floor(hoursSinceStart / 24);

    const daysRemaining = GRACE_PERIOD_DAYS - daysInGracePeriod;

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      gracePeriodStartedAt: gracePeriodStart,
      daysInGracePeriod,
      shouldSuspend: daysInGracePeriod >= GRACE_PERIOD_DAYS,
      shouldWarn:
        WARNING_DAYS.includes(daysRemaining) && daysRemaining > 0,
      shouldDelete: false, // Handled in checkForDeletion
      shouldWarnDeletion: false,
      currency: customer.currency,
    };
  }

  /**
   * Take appropriate action based on grace period status
   */
  private async takeAction(status: GracePeriodStatus): Promise<void> {
    if (status.shouldSuspend) {
      await this.suspendUserPods(status);
    } else if (status.shouldWarn) {
      await this.sendWarningEmail(status);
    }
  }

  /**
   * Suspend all pods for a user
   */
  private async suspendUserPods(status: GracePeriodStatus): Promise<void> {
    console.log(`[GracePeriodEnforcer] Suspending pods for user ${status.userId}`);

    try {
      // Get customer to find Stripe customer ID
      const customer = await db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.userId, status.userId))
        .limit(1);

      if (customer.length > 0) {
        await podSuspensionService.suspendUserPods(
          customer[0].stripeCustomerId,
        );

        // Update customer status to suspended
        await db
          .update(stripeCustomers)
          .set({
            status: "suspended",
            updatedAt: new Date(),
          })
          .where(eq(stripeCustomers.userId, status.userId));

        console.log(
          `[GracePeriodEnforcer] Pods suspended for user ${status.userId}`,
        );
      }
    } catch (error) {
      console.error(
        `[GracePeriodEnforcer] Failed to suspend pods for user ${status.userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Send grace period warning email
   */
  private async sendWarningEmail(status: GracePeriodStatus): Promise<void> {
    const daysRemaining = GRACE_PERIOD_DAYS - status.daysInGracePeriod;

    console.log(
      `[GracePeriodEnforcer] Sending warning email to ${status.email} (${daysRemaining} days remaining)`,
    );

    try {
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

      // Get the last failed invoice amount
      // For now, use a placeholder - in production you'd query the invoices table
      const amount = "0.00"; // TODO: Get from last invoice
      const currency = status.currency || "usd";

      await sendGracePeriodWarningEmail({
        to: status.email,
        name: status.name || "there",
        daysRemaining,
        amount,
        currency,
        billingUrl: `${baseUrl}/dashboard/billing`,
      });

      console.log(
        `[GracePeriodEnforcer] Warning email sent to ${status.email}`,
      );
    } catch (error) {
      console.error(
        `[GracePeriodEnforcer] Failed to send warning email to ${status.email}:`,
        error,
      );
      // Don't throw - email failure shouldn't block enforcement
    }
  }

  /**
   * Check for suspended users that should receive deletion warnings or be deleted
   */
  private async checkForDeletion(): Promise<void> {
    console.log("[GracePeriodEnforcer] Checking for users to delete...");

    const now = new Date();
    const deletionThreshold = new Date(
      now.getTime() - SUSPENSION_TO_DELETION_DAYS * 24 * 60 * 60 * 1000,
    );

    // Get all suspended customers
    const suspendedCustomers = await db
      .select({
        customer: stripeCustomers,
        user: users,
      })
      .from(stripeCustomers)
      .innerJoin(users, eq(users.id, stripeCustomers.userId))
      .where(
        and(
          eq(stripeCustomers.status, "suspended"),
          isNotNull(stripeCustomers.gracePeriodStartedAt),
        ),
      );

    for (const { customer, user } of suspendedCustomers) {
      const suspensionStart = customer.gracePeriodStartedAt!;
      const daysSinceSuspension = Math.floor(
        (now.getTime() - suspensionStart.getTime()) / (1000 * 60 * 60 * 24),
      );

      const daysSinceGracePeriodStart =
        daysSinceSuspension - GRACE_PERIOD_DAYS;

      // Send deletion warnings
      if (DELETION_WARNING_DAYS.includes(daysSinceGracePeriodStart)) {
        await this.sendDeletionWarning(
          user,
          SUSPENSION_TO_DELETION_DAYS - daysSinceGracePeriodStart,
        );
      }

      // Delete if past threshold
      if (suspensionStart <= deletionThreshold) {
        await this.deleteUserData(user.id, customer.stripeCustomerId);
      }
    }
  }

  /**
   * Send deletion warning email
   */
  private async sendDeletionWarning(
    user: typeof users.$inferSelect,
    daysUntilDeletion: number,
  ): Promise<void> {
    console.log(
      `[GracePeriodEnforcer] Sending deletion warning to ${user.email} (${daysUntilDeletion} days remaining)`,
    );

    try {
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

      await sendFinalDeletionWarningEmail({
        to: user.email,
        name: user.name || "there",
        daysUntilDeletion,
        billingUrl: `${baseUrl}/dashboard/billing`,
      });

      console.log(
        `[GracePeriodEnforcer] Deletion warning sent to ${user.email}`,
      );
    } catch (error) {
      console.error(
        `[GracePeriodEnforcer] Failed to send deletion warning to ${user.email}:`,
        error,
      );
    }
  }

  /**
   * Permanently delete user data
   */
  private async deleteUserData(
    userId: string,
    stripeCustomerId: string,
  ): Promise<void> {
    console.log(`[GracePeriodEnforcer] Deleting all data for user ${userId}`);

    try {
      // Delete all pods and snapshots
      await podSuspensionService.deleteUserPods(stripeCustomerId);

      // Update customer status to deleted
      await db
        .update(stripeCustomers)
        .set({
          status: "deleted",
          updatedAt: new Date(),
        })
        .where(eq(stripeCustomers.userId, userId));

      console.log(`[GracePeriodEnforcer] Data deleted for user ${userId}`);
    } catch (error) {
      console.error(
        `[GracePeriodEnforcer] Failed to delete data for user ${userId}:`,
        error,
      );
      throw error;
    }
  }
}

// Export singleton instance
export const gracePeriodEnforcer = new GracePeriodEnforcer();

