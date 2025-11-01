import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";
import {
  githubInstallations,
  userGithubInstallations,
} from "../../../lib/db/schema";
import { getGitHubApp, getInstallationRepositories } from "../../github-app";
import { createTRPCRouter, protectedProcedure } from "../server";

// Simple in-memory cache for GitHub data (3 minutes TTL)
type CachedData<T> = { data: T; timestamp: number };
const githubCache = new Map<string, CachedData<unknown>>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

// Helper to clean up expired cache entries
const cleanupExpiredCache = (): void => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, value] of githubCache.entries()) {
    if (now - value.timestamp >= CACHE_TTL_MS) {
      githubCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(
      `[GitHub Cache] Cleaned up ${cleaned} expired entries, ${githubCache.size} remaining`,
    );
  }
};

// Helper to get or compute cached data
const getCachedOrCompute = async <T>(
  cacheKey: string,
  compute: () => Promise<T>,
): Promise<T> => {
  // Clean up expired entries to keep memory low
  cleanupExpiredCache();

  // Check cache first
  const cached = githubCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[GitHub Cache] Hit for ${cacheKey}`);
    return cached.data as T;
  }

  // Compute fresh data
  const data = await compute();

  // Cache the result
  githubCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });

  return data;
};

export const githubAppRouter = createTRPCRouter({
  getInstallationUrl: protectedProcedure
    .input(
      z.object({
        returnTo: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      if (!env.GITHUB_APP_SLUG) {
        // Return null instead of throwing error - let the frontend handle this gracefully
        return null;
      }

      const baseUrl = `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`;
      const params = new URLSearchParams();

      if (input.returnTo) {
        params.append("state", input.returnTo);
      }

      // Note: The callback URL should be configured in the GitHub App settings
      // as the "Setup URL" - it cannot be overridden via URL parameters

      return `${baseUrl}?${params.toString()}`;
    }),

  getInstallations: protectedProcedure.query(async ({ ctx }) => {
    const userId = (ctx.session.user as any).id;

    try {
      // Get user's GitHub App installations from database
      const userInstallations = await ctx.db
        .select({
          id: githubInstallations.id,
          installationId: githubInstallations.installationId,
          accountLogin: githubInstallations.accountLogin,
          accountType: githubInstallations.accountType,
          repositorySelection: githubInstallations.repositorySelection,
          role: userGithubInstallations.role,
        })
        .from(userGithubInstallations)
        .innerJoin(
          githubInstallations,
          eq(userGithubInstallations.installationId, githubInstallations.id),
        )
        .where(eq(userGithubInstallations.userId, userId));

      return {
        hasInstallations: userInstallations.length > 0,
        installations: userInstallations,
      };
    } catch (error) {
      console.error("Failed to fetch GitHub App installations:", error);
      return {
        hasInstallations: false,
        installations: [],
      };
    }
  }),

  // Handle GitHub App installation callback
  handleInstallationCallback: protectedProcedure
    .input(
      z.object({
        installationId: z.number(),
        setupAction: z.string().optional(),
        state: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx.session.user as any).id;

      try {
        // Get installation details from GitHub
        const app = getGitHubApp();
        const { data: installation } = await app.octokit.request(
          "GET /app/installations/{installation_id}",
          {
            installation_id: input.installationId,
          },
        );

        // Store installation in database
        const [storedInstallation] = await ctx.db
          .insert(githubInstallations)
          .values({
            installationId: installation.id,
            accountId: installation.account!.id,
            accountLogin: (installation.account as any).login,
            accountType: (installation.account as any).type,
            permissions: JSON.stringify(installation.permissions),
            repositorySelection: installation.repository_selection,
          })
          .onConflictDoUpdate({
            target: githubInstallations.installationId,
            set: {
              accountId: installation.account!.id,
              accountLogin: (installation.account as any).login,
              accountType: (installation.account as any).type,
              permissions: JSON.stringify(installation.permissions),
              repositorySelection: installation.repository_selection,
              updatedAt: new Date(),
            },
          })
          .returning();

        // Link user to installation
        await ctx.db
          .insert(userGithubInstallations)
          .values({
            userId,
            installationId: storedInstallation.id,
            role: "admin", // User who installed the app is admin
          })
          .onConflictDoNothing();

        return {
          success: true,
          redirectTo: input.state || "/setup/project",
        };
      } catch (error) {
        console.error("Failed to handle installation callback:", error);
        throw new Error("Failed to process GitHub App installation");
      }
    }),

  // Get repositories from GitHub App installations
  getRepositoriesFromInstallations: protectedProcedure
    .input(
      z.object({
        installationId: z.string().optional(),
      }),
    )
    .query(async ({ ctx }) => {
      const userId = (ctx.session.user as any).id;
      const cacheKey = `repos:${userId}`;

      return getCachedOrCompute(cacheKey, async () => {
        try {
          // Get user's installations
          const userInstallations = await ctx.db
            .select({
              installationId: githubInstallations.installationId,
              accountLogin: githubInstallations.accountLogin,
              accountType: githubInstallations.accountType,
            })
            .from(userGithubInstallations)
            .innerJoin(
              githubInstallations,
              eq(
                userGithubInstallations.installationId,
                githubInstallations.id,
              ),
            )
            .where(eq(userGithubInstallations.userId, userId));

          // Get repositories from all installations
          const allRepositories = [];
          for (const installation of userInstallations) {
            const repos = await getInstallationRepositories(
              installation.installationId,
            );
            allRepositories.push(...repos);
          }
          allRepositories.sort(
            (a, b) =>
              (b.pushed_at ? new Date(b.pushed_at).getTime() : 0) -
              (a.pushed_at ? new Date(a.pushed_at).getTime() : 0),
          );

          console.log(
            `[GitHub Cache] Cached ${allRepositories.length} repositories for ${cacheKey}`,
          );
          return allRepositories;
        } catch (error) {
          console.error(
            "Failed to get repositories from installations:",
            error,
          );
          return [];
        }
      });
    }),

  // Get all accounts (personal + organizations) from GitHub App installations
  getAccountsFromInstallations: protectedProcedure.query(async ({ ctx }) => {
    const userId = (ctx.session.user as any).id;
    const cacheKey = `accounts:${userId}`;

    return getCachedOrCompute(cacheKey, async () => {
      try {
        // Get user's installations
        const userInstallations = await ctx.db
          .select({
            installationId: githubInstallations.installationId,
            accountLogin: githubInstallations.accountLogin,
            accountType: githubInstallations.accountType,
          })
          .from(userGithubInstallations)
          .innerJoin(
            githubInstallations,
            eq(userGithubInstallations.installationId, githubInstallations.id),
          )
          .where(eq(userGithubInstallations.userId, userId));

        // Return all accounts where the app is installed
        const accounts = userInstallations.map((installation) => ({
          id: installation.installationId,
          login: installation.accountLogin,
          avatar_url: `https://github.com/${installation.accountLogin}.png`,
          type: installation.accountType,
        }));

        console.log(
          `[GitHub Cache] Cached ${accounts.length} accounts for ${cacheKey}`,
        );
        return accounts;
      } catch (error) {
        console.error("Failed to get accounts from installations:", error);
        return [];
      }
    });
  }),

  // Get user's GitHub installations for account page
  getUserInstallations: protectedProcedure.query(async ({ ctx }) => {
    const userId = (ctx.session.user as any).id;

    try {
      const userInstallations = await ctx.db
        .select({
          id: githubInstallations.id,
          installationId: githubInstallations.installationId,
          accountLogin: githubInstallations.accountLogin,
          accountType: githubInstallations.accountType,
        })
        .from(userGithubInstallations)
        .innerJoin(
          githubInstallations,
          eq(userGithubInstallations.installationId, githubInstallations.id),
        )
        .where(eq(userGithubInstallations.userId, userId));

      return userInstallations;
    } catch (error) {
      console.error("Failed to get user installations:", error);
      return [];
    }
  }),

  // Read pinacle.yaml from a GitHub repository
  getPinacleConfig: protectedProcedure
    .input(
      z.object({
        repository: z.string(), // owner/repo format
        branch: z.string().optional().default("main"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = (ctx.session.user as any).id;

      try {
        // Extract owner and repo from the repository string
        const [owner, repo] = input.repository.split("/");
        if (!owner || !repo) {
          throw new Error("Invalid repository format. Expected 'owner/repo'");
        }

        // Get user's installations to find the right one for this repository
        const userInstallations = await ctx.db
          .select({
            installationId: githubInstallations.installationId,
            accountLogin: githubInstallations.accountLogin,
          })
          .from(userGithubInstallations)
          .innerJoin(
            githubInstallations,
            eq(userGithubInstallations.installationId, githubInstallations.id),
          )
          .where(eq(userGithubInstallations.userId, userId));

        // Find installation for the repository owner
        const installation = userInstallations.find(
          (inst) => inst.accountLogin === owner,
        );

        if (!installation) {
          return {
            found: false,
            content: null,
            error: `GitHub App not installed on ${owner}`,
          };
        }

        // Get Octokit instance for this installation
        const { Octokit } = await import("@octokit/rest");
        const { createAppAuth } = await import("@octokit/auth-app");

        const auth = createAppAuth({
          appId: env.GITHUB_APP_ID!,
          privateKey: env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, "\n"),
          installationId: installation.installationId,
        });

        const installationAuth = await auth({ type: "installation" });
        const octokit = new Octokit({ auth: installationAuth.token });

        // Try to get pinacle.yaml file content
        try {
          const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: "pinacle.yaml",
            ref: input.branch,
          });

          if ("content" in data && data.content) {
            // Decode base64 content
            const content = Buffer.from(data.content, "base64").toString(
              "utf-8",
            );
            return {
              found: true,
              content,
              error: null,
            };
          }

          return {
            found: false,
            content: null,
            error: "File found but could not read content",
          };
        } catch (error: any) {
          if (error.status === 404) {
            // File doesn't exist - this is not an error, just return not found
            return {
              found: false,
              content: null,
              error: null,
            };
          }

          throw error;
        }
      } catch (error) {
        console.error("Failed to read pinacle.yaml:", error);
        return {
          found: false,
          content: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
});
