import { createTRPCRouter } from "./server";
import { authRouter } from "./routers/auth";
import { teamsRouter } from "./routers/teams";
import { podsRouter } from "./routers/pods";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  teams: teamsRouter,
  pods: podsRouter,
});

export type AppRouter = typeof appRouter;

