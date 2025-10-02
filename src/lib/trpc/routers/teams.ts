import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { teamMembers, teams } from "../../db/schema";
import { createTRPCRouter, protectedProcedure } from "../server";

const createTeamSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().optional(),
});

const inviteMemberSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

export const teamsRouter = createTRPCRouter({
  create: protectedProcedure
    .input(createTeamSchema)
    .mutation(async ({ ctx, input }) => {
      const { name, description } = input;
      const userId = (ctx.session.user as any).id;

      // Generate slug from name
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const [team] = await ctx.db
        .insert(teams)
        .values({
          name,
          slug,
          description,
          ownerId: userId,
        })
        .returning();

      // Add owner as team member
      await ctx.db.insert(teamMembers).values({
        teamId: team.id,
        userId,
        role: "owner",
      });

      return team;
    }),

  getUserTeams: protectedProcedure.query(async ({ ctx }) => {
    const userId = (ctx.session.user as any).id;

    const userTeams = await ctx.db
      .select({
        id: teams.id,
        name: teams.name,
        slug: teams.slug,
        description: teams.description,
        role: teamMembers.role,
        createdAt: teams.createdAt,
      })
      .from(teams)
      .innerJoin(teamMembers, eq(teams.id, teamMembers.teamId))
      .where(eq(teamMembers.userId, userId));

    return userTeams;
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = (ctx.session.user as any).id;

      // Check if user is member of this team
      const membership = await ctx.db
        .select()
        .from(teamMembers)
        .where(
          and(eq(teamMembers.teamId, input.id), eq(teamMembers.userId, userId)),
        )
        .limit(1);

      if (membership.length === 0) {
        throw new Error("Team not found or access denied");
      }

      const [team] = await ctx.db
        .select()
        .from(teams)
        .where(eq(teams.id, input.id))
        .limit(1);

      return team;
    }),

  getMembers: protectedProcedure
    .input(z.object({ teamId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = (ctx.session.user as any).id;

      // Check if user is member of this team
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

      // Get all team members
      const members = await ctx.db
        .select({
          id: teamMembers.id,
          role: teamMembers.role,
          joinedAt: teamMembers.joinedAt,
          user: {
            id: teamMembers.userId,
            name: teamMembers.userId, // We'll need to join with users table
            email: teamMembers.userId, // We'll need to join with users table
          },
        })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, input.teamId));

      return members;
    }),

  inviteMember: protectedProcedure
    .input(inviteMemberSchema)
    .mutation(async ({ ctx, input }) => {
      const { teamId } = input;
      const userId = (ctx.session.user as any).id;

      // Check if user is admin/owner of this team
      const membership = await ctx.db
        .select()
        .from(teamMembers)
        .where(
          and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
        )
        .limit(1);

      if (
        membership.length === 0 ||
        !["owner", "admin"].includes(membership[0].role)
      ) {
        throw new Error("Permission denied");
      }

      // TODO: Implement actual invitation system
      // For now, we'll just return success
      return { success: true, message: "Invitation sent" };
    }),
});
