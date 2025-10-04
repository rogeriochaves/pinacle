import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";
import { podMetrics, serverMetrics, servers } from "../../db/schema";
import { createTRPCRouter, publicProcedure } from "../server";

// Middleware to check API key for server agents
const serverAgentAuth = publicProcedure.use(async (opts) => {
  const apiKey = opts.ctx.req?.headers.get("x-api-key");

  if (!env.SERVER_API_KEY || apiKey !== env.SERVER_API_KEY) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or missing API key",
    });
  }

  return opts.next();
});

export const serversRouter = createTRPCRouter({
  // Simple ping endpoint to test connectivity
  ping: publicProcedure.query(() => {
    return { pong: true, timestamp: new Date().toISOString() };
  }),

  // Register a new server
  registerServer: serverAgentAuth
    .input(
      z.object({
        hostname: z.string().min(1),
        ipAddress: z.string().min(1),
        cpuCores: z.number().positive(),
        memoryMb: z.number().positive(),
        diskGb: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [server] = await ctx.db
        .insert(servers)
        .values({
          hostname: input.hostname,
          ipAddress: input.ipAddress,
          cpuCores: input.cpuCores,
          memoryMb: input.memoryMb,
          diskGb: input.diskGb,
          status: "online",
          lastHeartbeatAt: new Date(),
        })
        .returning();

      return server;
    }),

  // Report metrics including per-pod metrics
  reportMetrics: serverAgentAuth
    .input(
      z.object({
        serverId: z.string(),
        cpuUsagePercent: z.number().min(0).max(100),
        memoryUsageMb: z.number().positive(),
        diskUsageGb: z.number().positive(),
        activePodsCount: z.number().min(0),
        podMetrics: z.array(
          z.object({
            podId: z.string(),
            containerId: z.string(),
            cpuUsagePercent: z.number().min(0).max(100),
            memoryUsageMb: z.number().min(0),
            diskUsageMb: z.number().min(0),
            networkRxBytes: z.number().min(0),
            networkTxBytes: z.number().min(0),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Update server last heartbeat at and status
      await ctx.db
        .update(servers)
        .set({
          lastHeartbeatAt: new Date(),
          status: "online",
        })
        .where(eq(servers.id, input.serverId))
        .execute();

      // Save server metrics
      const [serverMetric] = await ctx.db
        .insert(serverMetrics)
        .values({
          serverId: input.serverId,
          cpuUsagePercent: input.cpuUsagePercent,
          memoryUsageMb: input.memoryUsageMb,
          diskUsageGb: input.diskUsageGb,
          activePodsCount: input.activePodsCount,
        })
        .returning();

      // Save per-pod metrics
      if (input.podMetrics.length > 0) {
        await ctx.db.insert(podMetrics).values(
          input.podMetrics.map((pm) => ({
            podId: pm.podId,
            cpuUsagePercent: pm.cpuUsagePercent,
            memoryUsageMb: pm.memoryUsageMb,
            diskUsageMb: pm.diskUsageMb,
            networkRxBytes: pm.networkRxBytes,
            networkTxBytes: pm.networkTxBytes,
          })),
        );
      }

      return {
        success: true,
        serverMetric,
        podMetricsCount: input.podMetrics.length,
      };
    }),
});
