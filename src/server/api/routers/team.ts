import { eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, createTRPCRouter } from "@/server/api/trpc";
import {
  machineSpecs,
  machines,
  teamMembers,
  teams,
  users,
} from "@/server/db/schema";

export const teamRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db
      .select({
        teamId: teams.id,
        name: teams.name,
        slug: teams.slug,
        plan: teams.plan,
        role: teamMembers.role,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, ctx.session.user.id));

    return memberships;
  }),
  members: protectedProcedure
    .input(z.object({ teamId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const members = await ctx.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: teamMembers.role,
          joinedAt: teamMembers.createdAt,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, input.teamId));

      return members;
    }),
  pods: protectedProcedure
    .input(z.object({ teamId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const pods = await ctx.db
        .select({
          id: machines.id,
          name: machines.name,
          status: machines.status,
          template: machines.template,
          spec: {
            id: machineSpecs.id,
            name: machineSpecs.name,
            cpuCores: machineSpecs.cpuCores,
            memoryGb: machineSpecs.memoryGb,
            priceMonthly: machineSpecs.priceMonthly,
          },
          createdAt: machines.createdAt,
        })
        .from(machines)
        .leftJoin(machineSpecs, eq(machineSpecs.id, machines.specId))
        .where(eq(machines.teamId, input.teamId));

      return pods;
    }),
});
