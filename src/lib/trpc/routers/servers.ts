import { TRPCError } from "@trpc/server";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";
import { podMetrics, pods, serverMetrics, servers } from "../../db/schema";
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
        sshHost: z.string().min(1),
        sshPort: z.number().int().positive().default(22),
        sshUser: z.string().min(1).default("root"),
        limaVmName: z.string().optional(), // For Lima VMs
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
          sshHost: input.sshHost,
          sshPort: input.sshPort,
          sshUser: input.sshUser,
          limaVmName: input.limaVmName || null, // Store Lima VM name if provided
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
        cpuUsagePercent: z.number().min(0),
        memoryUsageMb: z.number().positive(),
        diskUsageGb: z.number().positive(),
        activePodsCount: z.number().min(0),
        podMetrics: z.array(
          z.object({
            podId: z.string(),
            containerId: z.string(),
            cpuUsagePercent: z.number().min(0),
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
      const [server] = await ctx.db
        .update(servers)
        .set({
          lastHeartbeatAt: new Date(),
          status: "online",
        })
        .where(eq(servers.id, input.serverId))
        .returning();

      if (!server) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Server not found",
        });
      }

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

      // Save per-pod metrics and update pod heartbeat timestamps
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

        // Update lastHeartbeatAt for all pods that sent metrics
        const now = new Date();
        await Promise.all(
          input.podMetrics.map((pm) =>
            ctx.db
              .update(pods)
              .set({ lastHeartbeatAt: now })
              .where(eq(pods.id, pm.podId)),
          ),
        );
      }

      logHeartbeat(server.hostname, {
        cpu: input.cpuUsagePercent,
        memory: (input.memoryUsageMb / server.memoryMb) * 100,
        disk: (input.diskUsageGb / server.diskGb) * 100,
        pods: input.activePodsCount,
      });

      return {
        success: true,
        serverMetric,
        podMetricsCount: input.podMetrics.length,
      };
    }),
});

export function logHeartbeat(
  hostname: string,
  metrics: { cpu: number; memory: number; disk: number; pods: number },
) {
  const frames = ["✦", "✧", "✶", "✸", "✹", "✺", "✻", "✼"];

  if ((globalThis as any).heartbeatIndex === undefined) {
    (globalThis as any).heartbeatIndex = 0;
  }
  const i = (globalThis as any).heartbeatIndex;
  const frame = frames[i % frames.length];

  process.stdout.write(
    `\r${chalk.green(frame)} heartbeat from ${hostname}: Pods: ${metrics.pods}, CPU: ${Math.round(metrics.cpu)}%, Memory: ${Math.round(metrics.memory)}%, Disk: ${Math.round(metrics.disk)}%`,
  );

  (globalThis as any).heartbeatIndex = i + 1;
}
