import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { dotenvs, teamMembers } from "../../db/schema";
import { formatAsDotenv } from "../../dotenv";
import { generateKSUID } from "../../utils";
import { createTRPCRouter, protectedProcedure } from "../server";

export const envSetsRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        teamId: z.string(),
        variables: z.record(z.string(), z.string()).optional(), // Legacy support
        content: z.string().optional(), // New dotenv format
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

      // Use content if provided, otherwise convert variables to dotenv format
      const content =
        input.content ||
        (input.variables ? formatAsDotenv(input.variables) : "");

      // Create dotenv
      const [dotenv] = await ctx.db
        .insert(dotenvs)
        .values({
          id: generateKSUID("dotenv"),
          name: input.name,
          description: input.description,
          ownerId: userId,
          teamId: input.teamId,
          content,
        })
        .returning();

      return dotenv;
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

      // Get all dotenvs for this team
      const teamDotenvs = await ctx.db
        .select()
        .from(dotenvs)
        .where(eq(dotenvs.teamId, input.teamId));

      return teamDotenvs;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Get dotenv with team membership check
      const [result] = await ctx.db
        .select()
        .from(dotenvs)
        .innerJoin(teamMembers, eq(dotenvs.teamId, teamMembers.teamId))
        .where(and(eq(dotenvs.id, input.id), eq(teamMembers.userId, userId)))
        .limit(1);

      if (!result) {
        throw new Error("Dotenv not found or access denied");
      }

      return result.dotenv;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        variables: z.record(z.string(), z.string()).optional(), // Legacy support
        content: z.string().optional(), // New dotenv format
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user has access to this dotenv
      const [result] = await ctx.db
        .select()
        .from(dotenvs)
        .innerJoin(teamMembers, eq(dotenvs.teamId, teamMembers.teamId))
        .where(and(eq(dotenvs.id, input.id), eq(teamMembers.userId, userId)))
        .limit(1);

      if (!result) {
        throw new Error("Dotenv not found or access denied");
      }

      // Determine content to update
      let contentUpdate: string | undefined;
      if (input.content !== undefined) {
        contentUpdate = input.content;
      } else if (input.variables) {
        contentUpdate = formatAsDotenv(input.variables);
      }

      // Update dotenv
      const [updatedDotenv] = await ctx.db
        .update(dotenvs)
        .set({
          ...(input.name && { name: input.name }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
          ...(contentUpdate !== undefined && {
            content: contentUpdate,
          }),
          updatedAt: new Date(),
        })
        .where(eq(dotenvs.id, input.id))
        .returning();

      return updatedDotenv;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user has access and is owner
      const [dotenv] = await ctx.db
        .select()
        .from(dotenvs)
        .where(and(eq(dotenvs.id, input.id), eq(dotenvs.ownerId, userId)))
        .limit(1);

      if (!dotenv) {
        throw new Error("Dotenv not found or permission denied");
      }

      // Delete dotenv
      await ctx.db.delete(dotenvs).where(eq(dotenvs.id, input.id));

      return { success: true };
    }),
});
