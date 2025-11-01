import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../../../lib/trpc/root";
import { createTRPCContext } from "../../../../lib/trpc/server";

// Force dynamic rendering - don't try to collect data at build time
export const dynamic = 'force-dynamic';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ req }),
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`,
            );
          }
        : undefined,
  });

export { handler as GET, handler as POST };
