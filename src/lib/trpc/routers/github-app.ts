import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";
import {
  githubInstallations,
  userGithubInstallations,
} from "../../../lib/db/schema";
import { getGitHubApp, getInstallationRepositories } from "../../github-app";
import { createTRPCRouter, protectedProcedure } from "../server";

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
  getRepositoriesFromInstallations: protectedProcedure.query(
    async ({ ctx }) => {
      const userId = (ctx.session.user as any).id;

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

        // Get repositories from all installations
        const allRepositories = [];
        for (const installation of userInstallations) {
          const repos = await getInstallationRepositories(
            installation.installationId,
          );
          allRepositories.push(...repos);
        }

        return allRepositories;
      } catch (error) {
        console.error("Failed to get repositories from installations:", error);
        return [];
      }
    },
  ),

  // Get all accounts (personal + organizations) from GitHub App installations
  getAccountsFromInstallations: protectedProcedure.query(async ({ ctx }) => {
    const userId = (ctx.session.user as any).id;

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

      return accounts;
    } catch (error) {
      console.error("Failed to get accounts from installations:", error);
      return [];
    }
  }),
});
