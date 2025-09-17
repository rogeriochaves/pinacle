import { createTRPCRouter } from "@/server/api/trpc";
import { statusRouter } from "@/server/api/routers/status";
import { teamRouter } from "@/server/api/routers/team";

export const appRouter = createTRPCRouter({
  status: statusRouter,
  team: teamRouter,
});

export type AppRouter = typeof appRouter;
