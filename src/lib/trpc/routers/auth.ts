import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "../../auth";
import {
  teamMembers,
  teams,
  users,
  verificationTokens,
} from "../../db/schema";
import { sendResetPasswordEmail, sendWelcomeEmail } from "../../email";
import { createTRPCRouter, publicProcedure } from "../server";

const signUpSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  // UTM parameters (optional)
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
});

export const authRouter = createTRPCRouter({
  signUp: publicProcedure
    .input(signUpSchema)
    .mutation(async ({ ctx, input }) => {
      const { name, email, password, utmSource, utmMedium, utmCampaign, utmTerm, utmContent } = input;

      // Check if user already exists
      const existingUser = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length > 0) {
        // Check if they have a password (signed up with email) or just OAuth
        if (existingUser[0].password) {
          throw new Error(
            "An account with this email already exists. Please sign in with your email and password.",
          );
        }
        throw new Error(
          "An account with this email already exists. Please sign in with GitHub.",
        );
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user
      const [user] = await ctx.db
        .insert(users)
        .values({
          name,
          email,
          password: hashedPassword,
          utmSource,
          utmMedium,
          utmCampaign,
          utmTerm,
          utmContent,
        })
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
        });

      // Create personal team for the new user
      try {
        const teamName = `${name}'s Team`;
        const teamSlug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-team`;

        const [team] = await ctx.db
          .insert(teams)
          .values({
            name: teamName,
            slug: teamSlug,
            description: `Personal team for ${name}`,
            ownerId: user.id,
          })
          .returning();

        // Add user as team owner
        await ctx.db.insert(teamMembers).values({
          teamId: team.id,
          userId: user.id,
          role: "owner",
        });

        console.log(`Created personal team ${team.id} for new user ${user.id}`);
      } catch (error) {
        console.error(
          `Failed to create personal team for new user ${user.id}:`,
          error,
        );
        // Don't throw error here - user creation should succeed even if team creation fails
      }

      // Send welcome email
      try {
        const baseUrl =
          process.env.NEXTAUTH_URL || "http://localhost:3000";
        const dashboardUrl = `${baseUrl}/dashboard`;

        await sendWelcomeEmail({
          to: email,
          name,
          dashboardUrl,
        });

        console.log(`Welcome email sent to ${email}`);
      } catch (error) {
        console.error(
          `Failed to send welcome email to ${email}:`,
          error,
        );
        // Don't throw error here - user creation should succeed even if email fails
      }

      return user;
    }),

  requestPasswordReset: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { email } = input;

      // Find user
      const existingUser = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      // Always return success even if user doesn't exist (security best practice)
      if (existingUser.length === 0 || !existingUser[0].password) {
        console.log(
          `Password reset requested for non-existent or OAuth user: ${email}`,
        );
        return { success: true };
      }

      const user = existingUser[0];

      // Generate reset token
      const token = crypto.randomUUID();
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store token in database
      await ctx.db
        .insert(verificationTokens)
        .values({
          identifier: email,
          token,
          expires,
        })
        .onConflictDoUpdate({
          target: [verificationTokens.identifier, verificationTokens.token],
          set: {
            expires,
          },
        });

      // Send email
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;

      await sendResetPasswordEmail({
        to: email,
        name: user.name || "there",
        resetUrl,
      });

      console.log(`Password reset email sent to ${email}`);
      return { success: true };
    }),

  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string(),
        password: z.string().min(6),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { token, password } = input;

      // Find valid token
      const tokenRecord = await ctx.db
        .select()
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.token, token),
            gt(verificationTokens.expires, new Date()),
          ),
        )
        .limit(1);

      if (tokenRecord.length === 0) {
        throw new Error("Invalid or expired reset token");
      }

      const { identifier: email } = tokenRecord[0];

      // Find user
      const existingUser = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length === 0) {
        throw new Error("User not found");
      }

      // Hash new password
      const hashedPassword = await hashPassword(password);

      // Update user password
      await ctx.db
        .update(users)
        .set({
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(eq(users.email, email));

      // Delete used token
      await ctx.db
        .delete(verificationTokens)
        .where(eq(verificationTokens.token, token));

      console.log(`Password reset successful for ${email}`);
      return { success: true };
    }),
});
