import { and, eq, isNotNull } from "drizzle-orm";
import type { Locale } from "../../i18n";
import { db } from "../db";
import { stripeCustomers, users } from "../db/schema";
import {
  sendFinalDeletionWarningEmail,
  sendGracePeriodWarningEmail,
} from "../email";
import { deleteUserPods, suspendUserPods } from "./pod-suspension";

/**
 * Grace Period Enforcer
 * Manages grace period lifecycle for users with payment failures
 *
 * Timeline:
 * - Hour 0: Payment fails, grace period starts (24 hours)
 * - Hour 12: Warning email (12 hours remaining)
 * - Hour 18: Final warning email (6 hours remaining)
 * - Hour 24: Pods suspended
 * - Day 14: Warning email (7 days until deletion)
 * - Day 21: Warning email (data deletion in 7 days)
 * - Day 28: All data permanently deleted
 */

const GRACE_PERIOD_HOURS = 24; // 24 hours = 1 day
const GRACE_PERIOD_DAYS = 1; // For compatibility with day-based calculations
const SUSPENSION_TO_DELETION_DAYS = 21; // 3 weeks after suspension
const WARNING_HOURS = [12, 6]; // Send warnings at 12 hours and 6 hours remaining
const DELETION_WARNING_DAYS = [20, 14, 7]; // Warnings before final deletion

type GracePeriodStatus = {
  userId: string;
  email: string;
  name: string | null;
  preferredLanguage: string;
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

    // Calculate hours remaining (for 24-hour grace period)
    const hoursRemaining = Math.ceil(GRACE_PERIOD_HOURS - hoursSinceStart);

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      preferredLanguage: user.preferredLanguage || "en",
      gracePeriodStartedAt: gracePeriodStart,
      daysInGracePeriod,
      shouldSuspend: hoursSinceStart >= GRACE_PERIOD_HOURS,
      shouldWarn:
        WARNING_HOURS.includes(hoursRemaining) && hoursRemaining > 0,
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
        await suspendUserPods(customer[0].userId);

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
    // Calculate hours remaining (for 24-hour grace period)
    const now = new Date();
    const hoursSinceStart =
      (now.getTime() - status.gracePeriodStartedAt.getTime()) / (1000 * 60 * 60);
    const hoursRemaining = Math.ceil(GRACE_PERIOD_HOURS - hoursSinceStart);

    console.log(
      `[GracePeriodEnforcer] Sending warning email to ${status.email} (${hoursRemaining} hours remaining)`,
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
        daysRemaining: hoursRemaining, // Actually hours, not days (field name kept for compatibility)
        amount,
        currency,
        billingUrl: `${baseUrl}/dashboard/billing`,
        locale: (status.preferredLanguage as Locale) || "en",
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
        locale: (user.preferredLanguage as Locale) || "en",
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
    _stripeCustomerId: string,
  ): Promise<void> {
    console.log(`[GracePeriodEnforcer] Deleting all data for user ${userId}`);

    try {
      // Delete all pods and snapshots
      await deleteUserPods(userId);

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

