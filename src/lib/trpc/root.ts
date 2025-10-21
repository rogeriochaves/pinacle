import { adminRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { envSetsRouter } from "./routers/env-sets";
import { githubRouter } from "./routers/github";
import { githubAppRouter } from "./routers/github-app";
import { podsRouter } from "./routers/pods";
import { serversRouter } from "./routers/servers";
import { snapshotsRouter } from "./routers/snapshots";
import { teamsRouter } from "./routers/teams";
import { createTRPCRouter } from "./server";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  teams: teamsRouter,
  pods: podsRouter,
  envSets: envSetsRouter,
  github: githubRouter,
  githubApp: githubAppRouter,
  servers: serversRouter,
  admin: adminRouter,
  snapshots: snapshotsRouter,
});

export type AppRouter = typeof appRouter;
