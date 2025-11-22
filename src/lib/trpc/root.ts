import { adminRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { billingRouter } from "./routers/billing";
import { currencyRouter } from "./routers/currency";
import { envSetsRouter } from "./routers/env-sets";
import { githubRouter } from "./routers/github";
import { githubAppRouter } from "./routers/github-app";
import { podsRouter } from "./routers/pods";
import { serversRouter } from "./routers/servers";
import { snapshotsRouter } from "./routers/snapshots";
import { teamsRouter } from "./routers/teams";
import { usersRouter } from "./routers/users";
import { createTRPCRouter } from "./server";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  users: usersRouter,
  teams: teamsRouter,
  pods: podsRouter,
  envSets: envSetsRouter,
  github: githubRouter,
  githubApp: githubAppRouter,
  servers: serversRouter,
  admin: adminRouter,
  snapshots: snapshotsRouter,
  billing: billingRouter,
  currency: currencyRouter,
});

export type AppRouter = typeof appRouter;
