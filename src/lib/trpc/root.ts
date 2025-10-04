import { adminRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { githubRouter } from "./routers/github";
import { githubAppRouter } from "./routers/github-app";
import { podsRouter } from "./routers/pods";
import { serversRouter } from "./routers/servers";
import { teamsRouter } from "./routers/teams";
import { createTRPCRouter } from "./server";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  teams: teamsRouter,
  pods: podsRouter,
  github: githubRouter,
  githubApp: githubAppRouter,
  servers: serversRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
