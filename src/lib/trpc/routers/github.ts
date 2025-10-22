import { Octokit } from "@octokit/rest";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../server";

export const githubRouter = createTRPCRouter({
  checkTokenValidity: protectedProcedure.query(async ({ ctx }) => {
    const user = ctx.session.user as any;
    const accessToken = user.githubAccessToken;

    if (!accessToken) {
      return {
        valid: false,
        error: "GitHub access token not found. Please sign in with GitHub.",
      };
    }

    try {
      const octokit = new Octokit({
        auth: accessToken,
      });

      // Make a simple API call to check if the token is valid
      await octokit.request("GET /user");

      return { valid: true };
    } catch (error) {
      console.error("GitHub token validation error:", error);

      const status =
        typeof error === "object" && error !== null && "status" in error
          ? (error as Record<string, unknown>).status
          : undefined;

      if (status === 401) {
        return {
          valid: false,
          error:
            "GITHUB_AUTH_EXPIRED: Your GitHub authentication has expired. Please sign out and sign in again to reconnect your GitHub account.",
        };
      }

      // For other errors, we can't determine validity
      return {
        valid: false,
        error: "Failed to validate GitHub token. Please try again later.",
      };
    }
  }),

  getRepositories: protectedProcedure.query(async ({ ctx }) => {
    const user = ctx.session.user as any;
    const accessToken = user.githubAccessToken;

    if (!accessToken) {
      throw new Error("GitHub access token not found");
    }

    try {
      const octokit = new Octokit({
        auth: accessToken,
      });

      const { data: repositories } =
        await octokit.rest.repos.listForAuthenticatedUser({
          sort: "updated",
          per_page: 100,
          affiliation: "owner,collaborator,organization_member",
        });

      return repositories;
    } catch (error) {
      console.error("GitHub API error:", error);

      const status =
        typeof error === "object" && error !== null && "status" in error
          ? (error as Record<string, unknown>).status
          : undefined;

      if (status === 401) {
        throw new Error(
          "GITHUB_AUTH_EXPIRED: Your GitHub authentication has expired. Please sign out and sign in again to reconnect your GitHub account.",
        );
      }

      throw new Error("Failed to fetch repositories from GitHub");
    }
  }),

  getOrganizations: protectedProcedure.query(async ({ ctx }) => {
    const user = ctx.session.user as any;
    const accessToken = user.githubAccessToken;

    if (!accessToken) {
      throw new Error("GitHub access token not found");
    }

    try {
      const octokit = new Octokit({
        auth: accessToken,
      });

      const { data: organizations } =
        await octokit.rest.orgs.listForAuthenticatedUser({
          per_page: 100,
        });

      console.log("Fetched organizations:", organizations);
      return organizations;
    } catch (error) {
      console.error("GitHub API error:", error);
      // For OAuth apps, organization access is limited
      // Return empty array instead of throwing error
      console.warn(
        "Organization access limited with OAuth app - consider GitHub App installation",
      );
      return [];
    }
  }),

  createRepository: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        organization: z.string().optional(),
        description: z.string().optional(),
        private: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.session.user as any;
      const accessToken = user.githubAccessToken;

      if (!accessToken) {
        throw new Error("GitHub access token not found");
      }

      try {
        const octokit = new Octokit({
          auth: accessToken,
        });

        const repoData = {
          name: input.name,
          description: input.description,
          private: input.private,
          auto_init: true, // Initialize with README
        };

        let repository: any;
        if (input.organization) {
          try {
            const { data } = await octokit.rest.repos.createInOrg({
              org: input.organization,
              ...repoData,
            });
            repository = data;
          } catch (orgError: any) {
            // If organization creation fails (likely due to permissions),
            // provide a more helpful error message
            if (orgError.status === 404) {
              throw new Error(
                `Cannot create repository in organization "${input.organization}". ` +
                  `This might be because: 1) You don't have permission to create repositories in this organization, ` +
                  `2) The organization doesn't exist, or 3) You need to use a GitHub App installation instead of personal access token.`,
              );
            }
            throw orgError;
          }
        } else {
          const { data } =
            await octokit.rest.repos.createForAuthenticatedUser(repoData);
          repository = data;
        }

        return repository;
      } catch (error) {
        console.error("GitHub API error:", error);
        throw new Error("Failed to create repository on GitHub");
      }
    }),

  createDeployKey: protectedProcedure
    .input(
      z.object({
        repository: z.string(), // owner/repo format
        title: z.string(),
        key: z.string(),
        readOnly: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.session.user as any;
      const accessToken = user.githubAccessToken;

      if (!accessToken) {
        throw new Error("GitHub access token not found");
      }

      try {
        const octokit = new Octokit({
          auth: accessToken,
        });

        const [owner, repo] = input.repository.split("/");

        const { data: deployKey } = await octokit.rest.repos.createDeployKey({
          owner,
          repo,
          title: input.title,
          key: input.key,
          read_only: input.readOnly,
        });

        return deployKey;
      } catch (error) {
        console.error("GitHub API error:", error);
        throw new Error("Failed to create deploy key on GitHub");
      }
    }),

  removeDeployKey: protectedProcedure
    .input(
      z.object({
        repository: z.string(), // owner/repo format
        keyId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.session.user as any;
      const accessToken = user.githubAccessToken;

      if (!accessToken) {
        throw new Error("GitHub access token not found");
      }

      try {
        const octokit = new Octokit({
          auth: accessToken,
        });

        const [owner, repo] = input.repository.split("/");

        await octokit.rest.repos.deleteDeployKey({
          owner,
          repo,
          key_id: input.keyId,
        });

        return { success: true };
      } catch (error) {
        console.error("GitHub API error:", error);
        throw new Error("Failed to remove deploy key from GitHub");
      }
    }),
});
