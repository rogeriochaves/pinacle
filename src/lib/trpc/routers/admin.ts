import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  githubInstallations,
  podLogs,
  podMetrics,
  pods,
  serverMetrics,
  servers,
  teamMembers,
  teams,
  userGithubInstallations,
  users,
} from "../../db/schema";
import { getAvailableServersCondition } from "../../servers";
import { createTRPCRouter, protectedProcedure } from "../server";

// Helper to check if user is admin
// Note: reads directly from process.env for testability
const isAdmin = (userEmail: string): boolean => {
  const adminEmails = process.env.ADMIN_EMAILS;
  if (!adminEmails) {
    return false;
  }

  const emailList = adminEmails
    .split(",")
    .map((email) => email.trim().toLowerCase());
  return emailList.includes(userEmail.toLowerCase());
};

// Admin-only middleware
const adminProcedure = protectedProcedure.use(async (opts) => {
  const userEmail = opts.ctx.session.user.email;

  if (!userEmail || !isAdmin(userEmail)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  return opts.next();
});

export const adminRouter = createTRPCRouter({
  // Check if current user is admin
  isAdmin: protectedProcedure.query(async ({ ctx }) => {
    const userEmail = ctx.session.user.email;
    return { isAdmin: userEmail ? isAdmin(userEmail) : false };
  }),

  // Get all servers with their latest metrics
  getAllServers: adminProcedure.query(async ({ ctx }) => {
    const allServers = await ctx.db.select().from(servers);

    // Get latest metrics for each server
    const serversWithMetrics = await Promise.all(
      allServers.map(async (server) => {
        const [latestMetric] = await ctx.db
          .select()
          .from(serverMetrics)
          .where(eq(serverMetrics.serverId, server.id))
          .orderBy(desc(serverMetrics.timestamp))
          .limit(1);

        // Count active pods on this server (excluding archived)
        const activePods = await ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(pods)
          .where(
            and(
              eq(pods.serverId, server.id),
              or(eq(pods.status, "running"), eq(pods.status, "starting")),
              isNull(pods.archivedAt), // Exclude archived pods
            ),
          );

        return {
          ...server,
          latestMetrics: latestMetric || null,
          activePodsCount: Number(activePods[0]?.count ?? 0),
        };
      }),
    );

    return serversWithMetrics;
  }),

  // Get server details with metrics
  getServerById: adminProcedure
    .input(z.object({ serverId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [server] = await ctx.db
        .select()
        .from(servers)
        .where(eq(servers.id, input.serverId))
        .limit(1);

      if (!server) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Server not found",
        });
      }

      // Get latest metric
      const [latestMetric] = await ctx.db
        .select()
        .from(serverMetrics)
        .where(eq(serverMetrics.serverId, input.serverId))
        .orderBy(desc(serverMetrics.timestamp))
        .limit(1);

      return {
        ...server,
        latestMetrics: latestMetric || null,
      };
    }),

  // Get server metrics history (last 24 hours by default)
  getServerMetricsHistory: adminProcedure
    .input(
      z.object({
        serverId: z.string(),
        hoursAgo: z.number().min(1).max(168).default(24), // Up to 7 days
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.hoursAgo * 60 * 60 * 1000);

      const metrics = await ctx.db
        .select()
        .from(serverMetrics)
        .where(
          and(
            eq(serverMetrics.serverId, input.serverId),
            gte(serverMetrics.timestamp, since),
          ),
        )
        .orderBy(serverMetrics.timestamp);

      return metrics;
    }),

  // Get all pods on a specific server
  getPodsOnServer: adminProcedure
    .input(z.object({ serverId: z.string() }))
    .query(async ({ ctx, input }) => {
      const podsOnServer = await ctx.db
        .select({
          pod: pods,
          owner: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
          team: {
            id: teams.id,
            name: teams.name,
            slug: teams.slug,
          },
        })
        .from(pods)
        .leftJoin(users, eq(pods.ownerId, users.id))
        .leftJoin(teams, eq(pods.teamId, teams.id))
        .where(
          and(
            eq(pods.serverId, input.serverId),
            isNull(pods.archivedAt), // Exclude archived pods
          ),
        );

      // Get latest metrics for each pod
      const podsWithMetrics = await Promise.all(
        podsOnServer.map(async ({ pod, owner, team }) => {
          const [latestMetric] = await ctx.db
            .select()
            .from(podMetrics)
            .where(eq(podMetrics.podId, pod.id))
            .orderBy(desc(podMetrics.timestamp))
            .limit(1);

          return {
            ...pod,
            owner,
            team,
            latestMetrics: latestMetric || null,
          };
        }),
      );

      return podsWithMetrics;
    }),

  // Get pod metrics history
  getPodMetricsHistory: adminProcedure
    .input(
      z.object({
        podId: z.string(),
        hoursAgo: z.number().min(1).max(168).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.hoursAgo * 60 * 60 * 1000);

      const metrics = await ctx.db
        .select()
        .from(podMetrics)
        .where(
          and(
            eq(podMetrics.podId, input.podId),
            gte(podMetrics.timestamp, since),
          ),
        )
        .orderBy(podMetrics.timestamp);

      return metrics;
    }),

  // Get pod provisioning logs
  getPodLogs: adminProcedure
    .input(
      z.object({
        podId: z.string(),
        limit: z.number().min(1).max(1000).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const logs = await ctx.db
        .select()
        .from(podLogs)
        .where(eq(podLogs.podId, input.podId))
        .orderBy(podLogs.timestamp)
        .limit(input.limit);

      return logs;
    }),

  // Get all users with search
  getAllUsers: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.db
        .select({
          user: users,
          teamCount: sql<number>`count(distinct ${teamMembers.teamId})`,
          podCount: sql<number>`count(distinct ${pods.id})`,
        })
        .from(users)
        .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
        .leftJoin(
          pods,
          and(eq(users.id, pods.ownerId), isNull(pods.archivedAt)),
        ) // Exclude archived pods
        .groupBy(users.id)
        .$dynamic();

      // Add search filter if provided
      if (input.search?.trim()) {
        const searchTerm = `%${input.search.trim()}%`;
        query = query.where(
          or(
            ilike(users.name, searchTerm),
            ilike(users.email, searchTerm),
            ilike(users.githubUsername, searchTerm),
          ),
        );
      }

      const usersData = await query.limit(input.limit).offset(input.offset);

      return usersData;
    }),

  // Get user details
  getUserDetails: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Get user's teams
      const userTeams = await ctx.db
        .select({
          team: teams,
          membership: teamMembers,
        })
        .from(teamMembers)
        .innerJoin(teams, eq(teamMembers.teamId, teams.id))
        .where(eq(teamMembers.userId, input.userId));

      // Get user's pods (excluding archived)
      const userPods = await ctx.db
        .select({
          pod: pods,
          team: {
            id: teams.id,
            name: teams.name,
          },
        })
        .from(pods)
        .leftJoin(teams, eq(pods.teamId, teams.id))
        .where(
          and(
            eq(pods.ownerId, input.userId),
            isNull(pods.archivedAt), // Exclude archived pods
          ),
        );

      // Get user's GitHub installations
      const githubInstalls = await ctx.db
        .select({
          installation: githubInstallations,
          role: userGithubInstallations.role,
        })
        .from(userGithubInstallations)
        .innerJoin(
          githubInstallations,
          eq(userGithubInstallations.installationId, githubInstallations.id),
        )
        .where(eq(userGithubInstallations.userId, input.userId));

      return {
        user,
        teams: userTeams,
        pods: userPods,
        githubInstallations: githubInstalls,
      };
    }),

  // Get pod details with logs and metrics
  getPodDetails: adminProcedure
    .input(z.object({ podId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [podData] = await ctx.db
        .select({
          pod: pods,
          owner: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
          team: {
            id: teams.id,
            name: teams.name,
            slug: teams.slug,
          },
          server: {
            id: servers.id,
            hostname: servers.hostname,
            ipAddress: servers.ipAddress,
          },
        })
        .from(pods)
        .leftJoin(users, eq(pods.ownerId, users.id))
        .leftJoin(teams, eq(pods.teamId, teams.id))
        .leftJoin(servers, eq(pods.serverId, servers.id))
        .where(eq(pods.id, input.podId))
        .limit(1);

      if (!podData) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pod not found",
        });
      }

      // Get latest metrics
      const [latestMetric] = await ctx.db
        .select()
        .from(podMetrics)
        .where(eq(podMetrics.podId, input.podId))
        .orderBy(desc(podMetrics.timestamp))
        .limit(1);

      // Get pod logs (container commands only for user-facing view)
      const logs = await ctx.db
        .select()
        .from(podLogs)
        .where(eq(podLogs.podId, input.podId))
        .orderBy(podLogs.timestamp)
        .limit(500);

      return {
        ...podData,
        latestMetrics: latestMetric || null,
        logs,
      };
    }),

  // Get team details with members
  getTeamDetails: adminProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [team] = await ctx.db
        .select()
        .from(teams)
        .where(eq(teams.id, input.teamId))
        .limit(1);

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        });
      }

      // Get team members with user details
      const members = await ctx.db
        .select({
          membership: teamMembers,
          user: users,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, input.teamId));

      // Get team pods
      const teamPods = await ctx.db
        .select({
          pod: pods,
          owner: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(pods)
        .leftJoin(users, eq(pods.ownerId, users.id))
        .where(eq(pods.teamId, input.teamId));

      // Get team owner details
      const [owner] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, team.ownerId))
        .limit(1);

      return {
        team,
        owner: owner || null,
        members,
        pods: teamPods,
      };
    }),

  // Get overall platform stats
  getPlatformStats: adminProcedure.query(async ({ ctx }) => {
    const [totalUsers] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(users);

    const [totalTeams] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(teams);

    const [totalPods] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(pods)
      .where(isNull(pods.archivedAt)); // Exclude archived pods

    const [activePods] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(pods)
      .where(
        and(
          or(eq(pods.status, "running"), eq(pods.status, "starting")),
          isNull(pods.archivedAt), // Exclude archived pods
        ),
      );

    const [totalServers] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(servers);

    const [onlineServers] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(servers)
      .where(getAvailableServersCondition());

    return {
      totalUsers: Number(totalUsers?.count ?? 0),
      totalTeams: Number(totalTeams?.count ?? 0),
      totalPods: Number(totalPods?.count ?? 0),
      activePods: Number(activePods?.count ?? 0),
      totalServers: Number(totalServers?.count ?? 0),
      onlineServers: Number(onlineServers?.count ?? 0),
    };
  }),
});
