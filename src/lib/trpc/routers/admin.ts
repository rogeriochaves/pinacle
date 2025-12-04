import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  githubInstallations,
  invoices,
  podLogs,
  podMetrics,
  podSnapshots,
  pods,
  serverMetrics,
  servers,
  stripeCustomers,
  stripeEvents,
  teamMembers,
  teams,
  usageRecords,
  userGithubInstallations,
  users,
} from "../../db/schema";
import { getAvailableServersCondition } from "../../servers";
import { stripe } from "../../stripe";
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

  // Get aggregated server metrics history with smart granularity
  getServerMetricsAggregated: adminProcedure
    .input(
      z.object({
        serverId: z.string(),
        hoursAgo: z.number().min(1).max(168).default(3), // Default to 3 hours
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.hoursAgo * 60 * 60 * 1000);

      // Determine aggregation interval based on time range
      // More aggressive aggregation for better frontend performance
      // <= 1 hour: 1 minute granularity (60 points)
      // 1-6 hours: 2 minute buckets (up to 180 points)
      // 6-24 hours: 5 minute buckets (up to 288 points)
      // 24-72 hours: 15 minute buckets (up to 288 points)
      // > 72 hours: 30 minute buckets
      let intervalMinutes: number;
      if (input.hoursAgo <= 1) {
        intervalMinutes = 1;
      } else if (input.hoursAgo <= 6) {
        intervalMinutes = 2;
      } else if (input.hoursAgo <= 24) {
        intervalMinutes = 5;
      } else if (input.hoursAgo <= 72) {
        intervalMinutes = 15;
      } else {
        intervalMinutes = 30;
      }

      // For 1-minute intervals only (1 hour or less), return raw data
      if (intervalMinutes === 1) {
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
      }

      // Aggregate using time buckets for larger intervals
      const intervalSeconds = intervalMinutes * 60;
      const metrics = await ctx.db
        .select({
          timestamp: sql<Date>`
            to_timestamp(
              floor(extract(epoch from ${serverMetrics.timestamp}) / ${intervalSeconds}) * ${intervalSeconds}
            )
          `,
          cpuUsagePercent: sql<number>`avg(${serverMetrics.cpuUsagePercent})`,
          memoryUsageMb: sql<number>`avg(${serverMetrics.memoryUsageMb})`,
          diskUsageGb: sql<number>`avg(${serverMetrics.diskUsageGb})`,
          activePodsCount: sql<number>`round(avg(${serverMetrics.activePodsCount}))`,
        })
        .from(serverMetrics)
        .where(
          and(
            eq(serverMetrics.serverId, input.serverId),
            gte(serverMetrics.timestamp, since),
          ),
        )
        .groupBy(sql`1`)
        .orderBy(sql`1`);

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

      const usersData = await query
        .orderBy(desc(users.createdAt))
        .limit(input.limit)
        .offset(input.offset);

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

      // Get Stripe customer from database
      const [stripeCustomer] = await ctx.db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.userId, input.userId))
        .limit(1);

      // Fetch Stripe events for this customer (shows complete activity timeline)
      let stripeEvents: Array<{
        id: string;
        type: string;
        created: number;
        data: {
          objectId: string | null;
          objectType: string | null;
          amount: number | null;
          currency: string | null;
          status: string | null;
          description: string | null;
        };
      }> | null = null;

      // Also fetch current subscriptions for quick status view
      let stripeSubscriptions: Array<{
        id: string;
        status: string;
        currentPeriodStart: number;
        currentPeriodEnd: number;
        cancelAtPeriodEnd: boolean;
        created: number;
      }> | null = null;

      if (stripeCustomer) {
        try {
          // Fetch all events for this customer (Stripe keeps 30 days of events)
          // We need to fetch events and filter by customer since events.list doesn't support customer filter directly
          const allEvents = await stripe.events.list({
            limit: 100,
            // We'll filter by customer in the results
          });

          // Filter events related to this customer
          const customerEvents = allEvents.data.filter((event) => {
            const obj = event.data.object as unknown as Record<string, unknown>;
            // Check if the event's object has this customer ID
            return (
              obj.customer === stripeCustomer.stripeCustomerId ||
              obj.id === stripeCustomer.stripeCustomerId
            );
          });

          stripeEvents = customerEvents.map((event) => {
            const obj = event.data.object as unknown as Record<string, unknown>;
            return {
              id: event.id,
              type: event.type,
              created: event.created,
              data: {
                objectId: (obj.id as string) ?? null,
                objectType: (obj.object as string) ?? null,
                amount: (obj.amount as number) ?? (obj.amount_total as number) ?? null,
                currency: (obj.currency as string) ?? null,
                status: (obj.status as string) ?? (obj.payment_status as string) ?? null,
                description: (obj.description as string) ?? null,
              },
            };
          });

          // Also get current subscriptions
          const subscriptionsData = await stripe.subscriptions.list({
            customer: stripeCustomer.stripeCustomerId,
            limit: 10,
          });

          stripeSubscriptions = subscriptionsData.data.map((sub) => {
            const firstItem = sub.items.data[0];
            return {
              id: sub.id,
              status: sub.status,
              currentPeriodStart: firstItem?.current_period_start ?? sub.created,
              currentPeriodEnd: firstItem?.current_period_end ?? sub.created,
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              created: sub.created,
            };
          });
        } catch (error) {
          console.error("Failed to fetch Stripe data:", error);
          // Don't fail the request, just return null
        }
      }

      return {
        user,
        teams: userTeams,
        pods: userPods,
        githubInstallations: githubInstalls,
        stripeCustomer,
        stripeEvents,
        stripeSubscriptions,
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

  // ===== BILLING ADMIN ENDPOINTS =====

  /**
   * Search users with billing information
   */
  searchUsersWithBilling: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(["all", "active", "past_due", "canceled", "no_subscription"]).optional().default("all"),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { search, status, limit, offset } = input;

      // Build query
      let query = ctx.db
        .select({
          user: users,
          stripeCustomer: stripeCustomers,
          podCount: sql<number>`count(distinct ${pods.id})`,
          snapshotCount: sql<number>`count(distinct ${podSnapshots.id})`,
        })
        .from(users)
        .leftJoin(stripeCustomers, eq(users.id, stripeCustomers.userId))
        .leftJoin(pods, and(eq(users.id, pods.ownerId), isNull(pods.archivedAt)))
        .leftJoin(podSnapshots, eq(pods.id, podSnapshots.podId))
        .groupBy(users.id, stripeCustomers.id)
        .$dynamic();

      // Add search filter
      if (search?.trim()) {
        const searchTerm = `%${search.trim()}%`;
        query = query.where(
          or(
            ilike(users.name, searchTerm),
            ilike(users.email, searchTerm),
            ilike(stripeCustomers.stripeCustomerId, searchTerm),
          ),
        );
      }

      // Add status filter
      if (status !== "all") {
        if (status === "no_subscription") {
          query = query.where(isNull(stripeCustomers.id));
        } else {
          query = query.where(eq(stripeCustomers.status, status));
        }
      }

      const results = await query.limit(limit).offset(offset);

      return results;
    }),

  /**
   * Get comprehensive billing details for a user
   */
  getUserBillingDetails: adminProcedure
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

      // Get Stripe customer info
      const [stripeCustomer] = await ctx.db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.userId, input.userId))
        .limit(1);

      if (!stripeCustomer) {
        return {
          user,
          stripeCustomer: null,
          subscription: null,
          pods: [],
          snapshots: [],
          currentUsage: null,
          recentInvoices: [],
          recentWebhooks: [],
        };
      }

      // Get subscription from Stripe
      let subscriptionDetails = null;
      if (stripeCustomer.stripeSubscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(
            stripeCustomer.stripeSubscriptionId,
          );

          const firstItem = subscription.items?.data?.[0];
          subscriptionDetails = {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: firstItem?.current_period_start
              ? new Date(firstItem.current_period_start * 1000)
              : null,
            currentPeriodEnd: firstItem?.current_period_end
              ? new Date(firstItem.current_period_end * 1000)
              : null,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            canceledAt: subscription.canceled_at
              ? new Date(subscription.canceled_at * 1000)
              : null,
          };
        } catch (error) {
          console.error("Failed to fetch subscription from Stripe:", error);
        }
      }

      // Get pods
      const userPods = await ctx.db
        .select()
        .from(pods)
        .where(
          and(
            eq(pods.ownerId, input.userId),
            isNull(pods.archivedAt),
          ),
        );

      // Get snapshots
      const userSnapshots = await ctx.db
        .select()
        .from(podSnapshots)
        .where(
          sql`${podSnapshots.podId} IN (
            SELECT id FROM ${pods} WHERE ${pods.ownerId} = ${input.userId}
          )`,
        );

      // Get current period usage
      const periodStart = subscriptionDetails?.currentPeriodStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const usageByType = await ctx.db
        .select({
          tierId: usageRecords.tierId,
          recordType: usageRecords.recordType,
          totalQuantity: sql<number>`SUM(${usageRecords.quantity})`,
          recordCount: sql<number>`COUNT(*)`,
        })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.userId, input.userId),
            gte(usageRecords.periodStart, periodStart),
          ),
        )
        .groupBy(usageRecords.tierId, usageRecords.recordType);

      // Get recent invoices
      const recentInvoices = await ctx.db
        .select()
        .from(invoices)
        .where(eq(invoices.userId, input.userId))
        .orderBy(desc(invoices.createdAt))
        .limit(10);

      // Get recent webhook events for this customer
      const recentWebhooks = await ctx.db
        .select()
        .from(stripeEvents)
        .where(
          sql`${stripeEvents.data}::text LIKE ${`%${stripeCustomer.stripeCustomerId}%`}`,
        )
        .orderBy(desc(stripeEvents.createdAt))
        .limit(20);

      return {
        user,
        stripeCustomer,
        subscription: subscriptionDetails,
        pods: userPods,
        snapshots: userSnapshots,
        currentUsage: usageByType,
        recentInvoices,
        recentWebhooks,
      };
    }),

  /**
   * Manually clear grace period and resume user pods (support recovery)
   */
  manuallyActivateSubscription: adminProcedure
    .input(z.object({ userId: z.string(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [stripeCustomer] = await ctx.db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.userId, input.userId))
        .limit(1);

      if (!stripeCustomer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No Stripe customer found for this user",
        });
      }

      // Clear grace period
      await ctx.db
        .update(stripeCustomers)
        .set({
          gracePeriodStartedAt: null,
          status: "active",
        })
        .where(eq(stripeCustomers.userId, input.userId));

      // Resume pods
      const { resumeUserPods } = await import("../../billing/pod-suspension");
      await resumeUserPods(input.userId);

      console.log(
        `[Admin] Manually activated subscription for user ${input.userId}: ${input.reason}`,
      );

      return { success: true };
    }),

  /**
   * Extend grace period by X hours (support exception)
   */
  extendGracePeriod: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        extensionHours: z.number().min(1).max(168), // Max 7 days
        reason: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [stripeCustomer] = await ctx.db
        .select()
        .from(stripeCustomers)
        .where(eq(stripeCustomers.userId, input.userId))
        .limit(1);

      if (!stripeCustomer || !stripeCustomer.gracePeriodStartedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is not in grace period",
        });
      }

      // Calculate new grace period start (by moving it back by extension hours)
      const currentStart = stripeCustomer.gracePeriodStartedAt;
      const newStart = new Date(
        currentStart.getTime() - input.extensionHours * 60 * 60 * 1000,
      );

      await ctx.db
        .update(stripeCustomers)
        .set({
          gracePeriodStartedAt: newStart,
        })
        .where(eq(stripeCustomers.userId, input.userId));

      console.log(
        `[Admin] Extended grace period by ${input.extensionHours}h for user ${input.userId}: ${input.reason}`,
      );

      return { success: true, newGracePeriodStart: newStart };
    }),

  /**
   * Manually trigger usage sync to Stripe for a user (debugging)
   */
  forceSyncUsageToStripe: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { UsageTracker } = await import("../../billing/usage-tracker");
      const tracker = new UsageTracker();

      console.log(
        `[Admin] Manually syncing usage for user ${input.userId}`,
      );

      // Count unreported before
      const unreportedBefore = await ctx.db
        .select()
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.userId, input.userId),
            eq(usageRecords.reportedToStripe, false),
          ),
        );

      // Trigger retry
      await tracker.retryUnreportedUsage();

      // Count unreported after
      const unreportedAfter = await ctx.db
        .select()
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.userId, input.userId),
            eq(usageRecords.reportedToStripe, false),
          ),
        );

      const synced = unreportedBefore.length - unreportedAfter.length;

      console.log(
        `[Admin] Synced ${synced} usage records for user ${input.userId}`,
      );

      return { success: true, synced, total: unreportedBefore.length };
    }),

  /**
   * Get overall billing metrics for dashboard
   */
  getBillingMetrics: adminProcedure.query(async ({ ctx }) => {
    // Count active subscriptions by status
    const subscriptionsByStatus = await ctx.db
      .select({
        status: stripeCustomers.status,
        count: sql<number>`count(*)`,
      })
      .from(stripeCustomers)
      .groupBy(stripeCustomers.status);

    // Count users in grace period
    const [gracePeriodCount] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(stripeCustomers)
      .where(sql`${stripeCustomers.gracePeriodStartedAt} IS NOT NULL`);

    // Count recent failed payments (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [failedPayments] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(
        and(
          sql`${invoices.status} IN ('open', 'uncollectible')`,
          gte(invoices.createdAt, sevenDaysAgo),
        ),
      );

    // Count total usage records this month
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [monthlyUsage] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(usageRecords)
      .where(gte(usageRecords.createdAt, monthStart));

    return {
      subscriptionsByStatus: subscriptionsByStatus.map((s) => ({
        status: s.status,
        count: Number(s.count),
      })),
      gracePeriodCount: Number(gracePeriodCount?.count ?? 0),
      failedPayments: Number(failedPayments?.count ?? 0),
      monthlyUsageRecords: Number(monthlyUsage?.count ?? 0),
    };
  }),

  /**
   * Start impersonating a user (admin only)
   */
  startImpersonation: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify target user exists
      const [targetUser] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Log impersonation event
      console.log(
        `[SECURITY] Admin ${ctx.session.user.email} (${ctx.session.user.id}) started impersonating user ${targetUser.email} (${targetUser.id})`,
      );

      return {
        success: true,
        targetUser: {
          id: targetUser.id,
          email: targetUser.email,
          name: targetUser.name,
        },
      };
    }),

  /**
   * End impersonation and return to admin session
   */
  endImpersonation: adminProcedure.mutation(async ({ ctx }) => {
    console.log(
      `[SECURITY] Ending impersonation session for admin ${ctx.session.user.realAdminId || ctx.session.user.id}`,
    );

    return { success: true };
  }),
});
