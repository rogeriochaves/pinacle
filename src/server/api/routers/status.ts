import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const statusRouter = createTRPCRouter({
  health: publicProcedure.query(() => ({
    ok: true,
    timestamp: Date.now(),
    message: "Pinacle API is ready",
  })),
});
