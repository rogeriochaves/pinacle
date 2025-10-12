import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { envSets, teamMembers } from "../../db/schema";
import { generateKSUID } from "../../utils";
import { createTRPCRouter, protectedProcedure } from "../server";

export const envSetsRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        teamId: z.string(),
        variables: z.record(z.string(), z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user is member of the team
      const membership = await ctx.db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, input.teamId),
            eq(teamMembers.userId, userId),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw new Error("Team not found or access denied");
      }

      // Create env set
      const [envSet] = await ctx.db
        .insert(envSets)
        .values({
          id: generateKSUID("env_set"),
          name: input.name,
          description: input.description,
          ownerId: userId,
          teamId: input.teamId,
          variables: JSON.stringify(input.variables),
        })
        .returning();

      return envSet;
    }),

  list: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user is member of the team
      const membership = await ctx.db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, input.teamId),
            eq(teamMembers.userId, userId),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw new Error("Team not found or access denied");
      }

      // Get all env sets for this team
      const teamEnvSets = await ctx.db
        .select()
        .from(envSets)
        .where(eq(envSets.teamId, input.teamId));

      return teamEnvSets;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Get env set with team membership check
      const [envSet] = await ctx.db
        .select()
        .from(envSets)
        .innerJoin(teamMembers, eq(envSets.teamId, teamMembers.teamId))
        .where(
          and(eq(envSets.id, input.id), eq(teamMembers.userId, userId)),
        )
        .limit(1);

      if (!envSet) {
        throw new Error("Env set not found or access denied");
      }

      return envSet.env_set;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        variables: z.record(z.string(), z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user has access to this env set
      const [envSet] = await ctx.db
        .select()
        .from(envSets)
        .innerJoin(teamMembers, eq(envSets.teamId, teamMembers.teamId))
        .where(
          and(eq(envSets.id, input.id), eq(teamMembers.userId, userId)),
        )
        .limit(1);

      if (!envSet) {
        throw new Error("Env set not found or access denied");
      }

      // Update env set
      const [updatedEnvSet] = await ctx.db
        .update(envSets)
        .set({
          ...(input.name && { name: input.name }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
          ...(input.variables && {
            variables: JSON.stringify(input.variables),
          }),
          updatedAt: new Date(),
        })
        .where(eq(envSets.id, input.id))
        .returning();

      return updatedEnvSet;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user has access and is owner
      const [envSet] = await ctx.db
        .select()
        .from(envSets)
        .where(and(eq(envSets.id, input.id), eq(envSets.ownerId, userId)))
        .limit(1);

      if (!envSet) {
        throw new Error("Env set not found or permission denied");
      }

      // Delete env set
      await ctx.db.delete(envSets).where(eq(envSets.id, input.id));

      return { success: true };
    }),
});

