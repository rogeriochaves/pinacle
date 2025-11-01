import { eq, and, lt, isNull } from "drizzle-orm";
import { db } from "../db";
import { checkoutSessions, users } from "../db/schema";
import { sendCheckoutRecoveryEmail } from "../email";

/**
 * CheckoutRecoveryService
 *
 * Manages abandoned checkout recovery emails
 * Sends emails at: 4 hours, 1 day (24 hours), and 3 days (72 hours) after abandonment
 */
export class CheckoutRecoveryService {
  // Email schedule (in hours after checkout creation)
  private readonly EMAIL_SCHEDULE = [4, 24, 72]; // 4 hours, 1 day, 3 days

  /**
   * Process abandoned checkouts and send recovery emails
   */
  async processAbandonedCheckouts(): Promise<void> {
    console.log("[CheckoutRecovery] Starting abandoned checkout processing...");

    const now = new Date();

    // Process each email attempt level (1, 2, 3)
    for (let attemptNumber = 1; attemptNumber <= 3; attemptNumber++) {
      await this.processEmailAttempt(attemptNumber, now);
    }

    // Mark expired checkouts (older than 7 days and still pending)
    await this.markExpiredCheckouts(now);

    console.log("[CheckoutRecovery] Completed abandoned checkout processing");
  }

  /**
   * Process a specific email attempt level
   */
  private async processEmailAttempt(
    attemptNumber: number,
    now: Date,
  ): Promise<void> {
    const emailsSentCount = attemptNumber - 1; // 0 for first email, 1 for second, 2 for third
    const hoursDelay = this.EMAIL_SCHEDULE[emailsSentCount];

    if (!hoursDelay) {
      return;
    }

    const cutoffTime = new Date(now.getTime() - hoursDelay * 60 * 60 * 1000);

    console.log(
      `[CheckoutRecovery] Processing email attempt ${attemptNumber} (${hoursDelay}h delay)...`,
    );

    // Find pending checkouts that:
    // 1. Are in pending status
    // 2. Were created before the cutoff time
    // 3. Haven't sent this email yet (emailsSent < attemptNumber)
    // 4. Haven't been abandoned too long ago (lastEmailSentAt is null or recent enough)
    const abandonedCheckouts = await db
      .select({
        checkout: checkoutSessions,
        user: users,
      })
      .from(checkoutSessions)
      .innerJoin(users, eq(checkoutSessions.userId, users.id))
      .where(
        and(
          eq(checkoutSessions.status, "pending"),
          lt(checkoutSessions.createdAt, cutoffTime),
          eq(checkoutSessions.emailsSent, emailsSentCount),
        ),
      )
      .limit(50); // Process in batches to avoid overwhelming email service

    console.log(
      `[CheckoutRecovery]   Found ${abandonedCheckouts.length} checkouts for attempt ${attemptNumber}`,
    );

    for (const { checkout, user } of abandonedCheckouts) {
      try {
        // Build checkout URL with session ID
        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
        const checkoutUrl = `${baseUrl}/setup/configure?recover=${checkout.stripeSessionId}`;

        // Send recovery email
        const result = await sendCheckoutRecoveryEmail({
          to: user.email,
          name: user.name || "there",
          tier: checkout.tier,
          checkoutUrl,
          attemptNumber: attemptNumber as 1 | 2 | 3,
        });

        if (result.success) {
          // Update checkout session to mark email as sent
          await db
            .update(checkoutSessions)
            .set({
              emailsSent: attemptNumber,
              lastEmailSentAt: now,
              updatedAt: now,
            })
            .where(eq(checkoutSessions.id, checkout.id));

          console.log(
            `[CheckoutRecovery]   ✓ Sent email ${attemptNumber} to ${user.email} (tier: ${checkout.tier})`,
          );
        } else {
          console.error(
            `[CheckoutRecovery]   ✗ Failed to send email to ${user.email}:`,
            result.error,
          );
        }
      } catch (error) {
        console.error(
          `[CheckoutRecovery]   ✗ Error processing checkout ${checkout.id}:`,
          error,
        );
      }
    }
  }

  /**
   * Mark checkouts as expired if they're too old (7+ days)
   */
  private async markExpiredCheckouts(now: Date): Promise<void> {
    const expirationTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days

    const result = await db
      .update(checkoutSessions)
      .set({
        status: "abandoned",
        updatedAt: now,
      })
      .where(
        and(
          eq(checkoutSessions.status, "pending"),
          lt(checkoutSessions.createdAt, expirationTime),
        ),
      );

    console.log(
      `[CheckoutRecovery] Marked expired checkouts as abandoned`,
    );
  }

  /**
   * Get recovery statistics
   */
  async getRecoveryStats(): Promise<{
    pending: number;
    completed: number;
    abandoned: number;
    emailsSent: { attempt1: number; attempt2: number; attempt3: number };
  }> {
    const [pending] = await db
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.status, "pending"));

    const [completed] = await db
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.status, "completed"));

    const [abandoned] = await db
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.status, "abandoned"));

    const [emailAttempt1] = await db
      .select()
      .from(checkoutSessions)
      .where(
        and(
          eq(checkoutSessions.status, "pending"),
          eq(checkoutSessions.emailsSent, 1),
        ),
      );

    const [emailAttempt2] = await db
      .select()
      .from(checkoutSessions)
      .where(
        and(
          eq(checkoutSessions.status, "pending"),
          eq(checkoutSessions.emailsSent, 2),
        ),
      );

    const [emailAttempt3] = await db
      .select()
      .from(checkoutSessions)
      .where(
        and(
          eq(checkoutSessions.status, "pending"),
          eq(checkoutSessions.emailsSent, 3),
        ),
      );

    return {
      pending: pending?.length || 0,
      completed: completed?.length || 0,
      abandoned: abandoned?.length || 0,
      emailsSent: {
        attempt1: emailAttempt1?.length || 0,
        attempt2: emailAttempt2?.length || 0,
        attempt3: emailAttempt3?.length || 0,
      },
    };
  }
}

export const checkoutRecoveryService = new CheckoutRecoveryService();

