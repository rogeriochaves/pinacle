import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../db/schema";
import { createTRPCRouter, protectedProcedure } from "../server";

const utmParametersSchema = z.object({
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
});

export const usersRouter = createTRPCRouter({
  saveUTMParameters: protectedProcedure
    .input(utmParametersSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Only save if at least one UTM parameter is provided
      if (
        !input.utmSource &&
        !input.utmMedium &&
        !input.utmCampaign &&
        !input.utmTerm &&
        !input.utmContent
      ) {
        return { success: false, message: "No UTM parameters provided" };
      }

      // Check if user already has UTM parameters saved
      const [existingUser] = await ctx.db
        .select({
          utmSource: users.utmSource,
          utmMedium: users.utmMedium,
          utmCampaign: users.utmCampaign,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      // Don't overwrite existing UTM data (first touch attribution)
      if (
        existingUser &&
        (existingUser.utmSource ||
          existingUser.utmMedium ||
          existingUser.utmCampaign)
      ) {
        console.log(
          `[UTM] User ${userId} already has UTM data, skipping update`,
        );
        return {
          success: false,
          message: "UTM parameters already exist (first-touch preserved)",
        };
      }

      // Save UTM parameters
      await ctx.db
        .update(users)
        .set({
          utmSource: input.utmSource,
          utmMedium: input.utmMedium,
          utmCampaign: input.utmCampaign,
          utmTerm: input.utmTerm,
          utmContent: input.utmContent,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      console.log(`[UTM] Saved UTM parameters for user ${userId}:`, input);

      return { success: true };
    }),
});

