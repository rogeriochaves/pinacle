import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { dotenvs, pods, teamMembers } from "../../db/schema";
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

      // Check if any non-archived pods are using this dotenv
      // Check for non-archived pods (archivedAt is null = active)
      const activePods = await ctx.db
        .select({ id: pods.id, name: pods.name })
        .from(pods)
        .where(and(eq(pods.dotenvId, input.id), isNull(pods.archivedAt)));

      if (activePods.length > 0) {
        throw new Error(
          `Cannot delete: ${activePods.length} active pod(s) are using this dotenv`,
        );
      }

      // Clear dotenvId from archived pods before deleting
      await ctx.db
        .update(pods)
        .set({ dotenvId: null })
        .where(eq(pods.dotenvId, input.id));

      // Delete dotenv
      await ctx.db.delete(dotenvs).where(eq(dotenvs.id, input.id));

      return { success: true };
    }),

  // List all dotenvs with usage information (which pods use them)
  listWithUsage: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Get all dotenvs owned by the user
    const userDotenvs = await ctx.db
      .select()
      .from(dotenvs)
      .where(eq(dotenvs.ownerId, userId))
      .orderBy(desc(dotenvs.updatedAt));

    if (userDotenvs.length === 0) {
      return [];
    }

    // Get all pods that use these dotenvs
    const dotenvIds = userDotenvs.map((d) => d.id);
    const podsUsingDotenvs = await ctx.db
      .select({
        id: pods.id,
        name: pods.name,
        status: pods.status,
        archivedAt: pods.archivedAt,
        githubRepo: pods.githubRepo,
        template: pods.template,
        dotenvId: pods.dotenvId,
        updatedAt: pods.updatedAt,
      })
      .from(pods)
      .where(inArray(pods.dotenvId, dotenvIds));

    // Group pods by dotenvId
    const podsByDotenvId = new Map<
      string,
      {
        id: string;
        name: string;
        status: string;
        isArchived: boolean;
        githubRepo: string | null;
        template: string | null;
      }[]
    >();
    for (const pod of podsUsingDotenvs) {
      if (!pod.dotenvId) continue;
      const existing = podsByDotenvId.get(pod.dotenvId) || [];
      existing.push({
        id: pod.id,
        name: pod.name,
        status: pod.status,
        isArchived: pod.archivedAt !== null,
        githubRepo: pod.githubRepo,
        template: pod.template,
      });
      podsByDotenvId.set(pod.dotenvId, existing);
    }

    // Combine dotenvs with their pod usage
    return userDotenvs.map((dotenv) => ({
      ...dotenv,
      pods: podsByDotenvId.get(dotenv.id) || [],
      canDelete:
        (podsByDotenvId.get(dotenv.id) || []).filter((p) => !p.isArchived)
          .length === 0,
    }));
  }),

  // Find a matching dotenv for a repo or template
  findMatching: protectedProcedure
    .input(
      z.object({
        githubRepo: z.string().optional(),
        template: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { githubRepo, template } = input;

      if (!githubRepo && !template) {
        return null;
      }

      // Find pods (including archived) that match the criteria and have a dotenv
      // Priority 1: Same github repo (most recent)
      // Priority 2: Same template (if not a blank template)

      const blankTemplates = ["nodejs-blank", "python-blank"];
      const isBlankTemplate = template && blankTemplates.includes(template);

      // Build query conditions
      const conditions = [
        eq(pods.ownerId, userId),
        sql`${pods.dotenvId} IS NOT NULL`,
      ];

      // Try to find by github repo first (highest priority)
      if (githubRepo) {
        const repoMatch = await ctx.db
          .select({
            dotenvId: pods.dotenvId,
            dotenvName: dotenvs.name,
            dotenvContent: dotenvs.content,
            podName: pods.name,
            githubRepo: pods.githubRepo,
            template: pods.template,
            updatedAt: pods.updatedAt,
          })
          .from(pods)
          .innerJoin(dotenvs, eq(pods.dotenvId, dotenvs.id))
          .where(
            and(
              eq(pods.ownerId, userId),
              eq(pods.githubRepo, githubRepo),
              sql`${pods.dotenvId} IS NOT NULL`,
            ),
          )
          .orderBy(desc(pods.updatedAt))
          .limit(1);

        if (repoMatch.length > 0) {
          return {
            matchType: "repo" as const,
            dotenvId: repoMatch[0].dotenvId,
            dotenvName: repoMatch[0].dotenvName,
            dotenvContent: repoMatch[0].dotenvContent,
            matchedPodName: repoMatch[0].podName,
            matchedRepo: repoMatch[0].githubRepo,
          };
        }
      }

      // Try to find by template (if not a blank template)
      if (template && !isBlankTemplate) {
        const templateMatch = await ctx.db
          .select({
            dotenvId: pods.dotenvId,
            dotenvName: dotenvs.name,
            dotenvContent: dotenvs.content,
            podName: pods.name,
            githubRepo: pods.githubRepo,
            template: pods.template,
            updatedAt: pods.updatedAt,
          })
          .from(pods)
          .innerJoin(dotenvs, eq(pods.dotenvId, dotenvs.id))
          .where(
            and(
              eq(pods.ownerId, userId),
              eq(pods.template, template),
              sql`${pods.dotenvId} IS NOT NULL`,
            ),
          )
          .orderBy(desc(pods.updatedAt))
          .limit(1);

        if (templateMatch.length > 0) {
          return {
            matchType: "template" as const,
            dotenvId: templateMatch[0].dotenvId,
            dotenvName: templateMatch[0].dotenvName,
            dotenvContent: templateMatch[0].dotenvContent,
            matchedPodName: templateMatch[0].podName,
            matchedTemplate: templateMatch[0].template,
          };
        }
      }

      return null;
    }),
});
