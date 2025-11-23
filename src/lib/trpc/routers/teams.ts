import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Locale } from "../../../i18n";
import { teamMembers, teams, users } from "../../db/schema";
import { sendTeamInviteEmail } from "../../email";
import { generateKSUID } from "../../utils";
import { createTRPCRouter, protectedProcedure } from "../server";

const createTeamSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().optional(),
});

const inviteMemberSchema = z.object({
  teamId: z.string(),
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

const acceptInvitationSchema = z.object({
  token: z.string(),
});

const removeMemberSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
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
    .input(z.object({ id: z.string() }))
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
    .input(z.object({ teamId: z.string() }))
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
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, input.teamId));

      return members;
    }),

  inviteMember: protectedProcedure
    .input(inviteMemberSchema)
    .mutation(async ({ ctx, input }) => {
      const { teamId, email, role } = input;
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

      // Check if there's already a pending invitation or membership for this email
      const existingInvitation = await ctx.db
        .select()
        .from(teamMembers)
        .where(
          and(eq(teamMembers.teamId, teamId), eq(teamMembers.email, email)),
        )
        .limit(1);

      if (existingInvitation.length > 0) {
        throw new Error(
          "An invitation has already been sent to this email address",
        );
      }

      // Get team and inviter info
      const [team] = await ctx.db
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.id, teamId));

      const [inviter] = await ctx.db
        .select({
          name: users.name,
          preferredLanguage: users.preferredLanguage,
        })
        .from(users)
        .where(eq(users.id, userId));

      // Check if user with this email already exists
      const existingUser = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length > 0) {
        // Existing user - add them directly to the team
        const invitedUserId = existingUser[0].id;

        // Check if user is already a member
        const existingMembership = await ctx.db
          .select()
          .from(teamMembers)
          .where(
            and(
              eq(teamMembers.teamId, teamId),
              eq(teamMembers.userId, invitedUserId),
            ),
          )
          .limit(1);

        if (existingMembership.length > 0) {
          throw new Error("User is already a member of this team");
        }

        // Add existing user directly to team
        await ctx.db.insert(teamMembers).values({
          teamId,
          userId: invitedUserId,
          email,
          role,
          invitedBy: userId,
          invitedAt: new Date(),
          joinedAt: new Date(),
        });

        // Send notification email
        const acceptUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard/team`;
        await sendTeamInviteEmail({
          to: email,
          invitedByName: inviter?.name || "Someone",
          teamName: team?.name || "Unknown Team",
          acceptUrl,
          locale: (inviter?.preferredLanguage as Locale) || "en",
        });

        return { success: true, message: "User added to team successfully" };
      } else {
        // New user - create pending invitation
        const invitationToken = generateKSUID("invitation");

        await ctx.db.insert(teamMembers).values({
          teamId,
          email,
          invitationToken,
          role,
          invitedBy: userId,
          invitedAt: new Date(),
          // joinedAt remains null for pending invitations
        });

        // Send invitation email
        const acceptUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/team/accept-invitation?token=${invitationToken}`;
        await sendTeamInviteEmail({
          to: email,
          invitedByName: inviter?.name || "Someone",
          teamName: team?.name || "Unknown Team",
          acceptUrl,
          locale: (inviter?.preferredLanguage as Locale) || "en",
        });

        return { success: true, message: "Invitation sent successfully" };
      }
    }),

  acceptInvitation: protectedProcedure
    .input(acceptInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      const { token } = input;
      const userId = (ctx.session.user as any).id;
      const userEmail = (ctx.session.user as any).email;

      // Find the pending invitation by token
      const [invitation] = await ctx.db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.invitationToken, token),
            isNull(teamMembers.joinedAt), // Must be pending
          ),
        )
        .limit(1);

      if (!invitation) {
        throw new Error("Invalid or expired invitation token");
      }

      // Check if the invitation email matches the current user's email
      if (invitation.email !== userEmail) {
        throw new Error(
          "This invitation was sent to a different email address",
        );
      }

      // Update the invitation to mark it as accepted
      await ctx.db
        .update(teamMembers)
        .set({
          userId,
          joinedAt: new Date(),
          invitationToken: null, // Clear the token
          updatedAt: new Date(),
        })
        .where(eq(teamMembers.id, invitation.id));

      return { success: true, message: "Successfully joined the team" };
    }),

  removeMember: protectedProcedure
    .input(removeMemberSchema)
    .mutation(async ({ ctx, input }) => {
      const { teamId, memberId } = input;
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

      // Get the member being removed to check if they're the owner
      const memberToRemove = await ctx.db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.id, memberId))
        .limit(1);

      if (memberToRemove.length === 0) {
        throw new Error("Member not found");
      }

      if (memberToRemove[0].role === "owner") {
        throw new Error("Cannot remove the team owner");
      }

      if (memberToRemove[0].teamId !== teamId) {
        throw new Error("Member is not part of this team");
      }

      // Remove the member
      await ctx.db.delete(teamMembers).where(eq(teamMembers.id, memberId));

      return {
        success: true,
        message: "Member removed from team successfully",
      };
    }),
});
