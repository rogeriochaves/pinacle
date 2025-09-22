import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  githubInstallations,
  pods,
  podTemplates,
  teamMembers,
  userGithubInstallations,
} from "../../db/schema";
import { getInstallationOctokit } from "../../github-app";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../server";

const createPodSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().optional(),
  templateId: z.string().uuid().optional(),
  teamId: z.string().uuid(),

  // GitHub repository information
  githubRepo: z.string().optional(), // owner/repo format
  githubBranch: z.string().default("main"),
  isNewProject: z.boolean().default(false),

  // New repository creation fields (when isNewProject is true)
  newRepoName: z.string().optional(), // name for new repository
  selectedOrg: z.string().optional(), // organization to create repo in

  // Resource specifications
  tier: z
    .enum(["dev.small", "dev.medium", "dev.large", "dev.xlarge"])
    .default("dev.small"),
  cpuCores: z.number().min(1).max(8).default(1),
  memoryMb: z.number().min(512).max(16384).default(1024),
  storageMb: z.number().min(1024).max(100000).default(10240),

  // Configuration
  config: z.record(z.string(), z.any()).optional(), // pinacle.yaml config as object
  envVars: z.record(z.string(), z.string()).optional(), // environment variables
});

export const podsRouter = createTRPCRouter({
  getTemplates: publicProcedure.query(async ({ ctx }) => {
    const templates = await ctx.db
      .select()
      .from(podTemplates)
      .where(eq(podTemplates.isActive, true));

    return templates;
  }),

  create: protectedProcedure
    .input(createPodSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        name,
        description,
        templateId,
        teamId,
        githubRepo,
        githubBranch,
        isNewProject,
        newRepoName,
        selectedOrg,
        tier,
        cpuCores,
        memoryMb,
        storageMb,
        config,
        envVars,
      } = input;
      const userId = (ctx.session.user as any).id;

      // Check if user is member of the team
      const membership = await ctx.db
        .select()
        .from(teamMembers)
        .where(
          and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
        )
        .limit(1);

      if (membership.length === 0) {
        throw new Error("Team not found or access denied");
      }

      // Handle repository creation for new projects
      let finalGithubRepo = githubRepo;
      if (isNewProject && newRepoName && selectedOrg) {
        try {
          // Get user's installations to find the right one for the organization
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

          // Find the installation for the target organization (or user)
          const targetInstallation = userInstallations.find(
            (inst) => inst.accountLogin === selectedOrg,
          );

          if (!targetInstallation) {
            throw new Error(
              `GitHub App is not installed on ${selectedOrg}. Please install the app first.`,
            );
          }

          // Get installation octokit
          const octokit = await getInstallationOctokit(
            targetInstallation.installationId,
          );

          const repoData = {
            name: newRepoName,
            description: `Development project created with Pinacle`,
            private: false,
            auto_init: true, // Initialize with README
          };

          let repository: any;
          if (targetInstallation.accountType === "Organization") {
            // Create in organization
            const { data } = await octokit.request("POST /orgs/{org}/repos", {
              org: selectedOrg,
              ...repoData,
            });
            repository = data;
          } else {
            // Create in user account
            const { data } = await octokit.request(
              "POST /user/repos",
              repoData,
            );
            repository = data;
          }

          finalGithubRepo = repository.full_name;
        } catch (error: any) {
          console.error("Failed to create repository:", error);

          if (error.status === 403) {
            throw new Error(
              `Cannot create repository. The GitHub App needs 'Contents' and 'Administration' permissions. ` +
                `Please update the app permissions and reinstall it.`,
            );
          }

          if (error.status === 404) {
            throw new Error(
              `Cannot create repository. This might be because: ` +
                `1) The GitHub App doesn't have 'Contents' or 'Administration' permissions, ` +
                `2) The app is not installed on ${selectedOrg}, or ` +
                `3) The organization doesn't exist.`,
            );
          }

          throw new Error(`Failed to create repository: ${error.message}`);
        }
      }

      // Calculate pricing based on tier
      const tierPricing = {
        "dev.small": { hourly: 0.008, monthly: 6 },
        "dev.medium": { hourly: 0.017, monthly: 12 },
        "dev.large": { hourly: 0.033, monthly: 24 },
        "dev.xlarge": { hourly: 0.067, monthly: 48 },
      };

      const pricing = tierPricing[tier];
      const monthlyPrice = pricing.monthly * 100; // in cents

      // Generate slug from name
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const [pod] = await ctx.db
        .insert(pods)
        .values({
          name,
          slug,
          description,
          templateId,
          teamId,
          ownerId: userId,
          githubRepo: finalGithubRepo,
          githubBranch,
          isNewProject,
          tier,
          cpuCores,
          memoryMb,
          storageMb,
          config: config ? JSON.stringify(config) : null,
          envVars: envVars ? JSON.stringify(envVars) : null,
          monthlyPrice,
          status: "creating",
        })
        .returning();

      // TODO: Queue pod provisioning job
      // This will:
      // 1. Generate SSH key pair
      // 2. Add deploy key to GitHub repo
      // 3. Create gVisor container
      // 4. Clone repository
      // 5. Set up services
      // 6. Start everything

      // For now, we'll just simulate it
      setTimeout(async () => {
        try {
          await ctx.db
            .update(pods)
            .set({
              status: "running",
              containerId: `container-${pod.id}`,
              internalIp: "192.168.1.100",
              publicUrl: `https://${slug}.pinacle.dev`,
              lastStartedAt: new Date(),
            })
            .where(eq(pods.id, pod.id));
        } catch (error) {
          console.error("Failed to update pod status:", error);
        }
      }, 5000);

      return pod;
    }),

  getUserPods: protectedProcedure.query(async ({ ctx }) => {
    const userId = (ctx.session.user as any).id;

    // Get all pods where user is a team member
    const userPods = await ctx.db
      .select({
        id: pods.id,
        name: pods.name,
        slug: pods.slug,
        description: pods.description,
        status: pods.status,
        cpuCores: pods.cpuCores,
        memoryMb: pods.memoryMb,
        monthlyPrice: pods.monthlyPrice,
        publicUrl: pods.publicUrl,
        createdAt: pods.createdAt,
        lastStartedAt: pods.lastStartedAt,
        teamId: pods.teamId,
      })
      .from(pods)
      .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
      .where(eq(teamMembers.userId, userId));

    return userPods;
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = (ctx.session.user as any).id;

      // Get pod with team membership check
      const [pod] = await ctx.db
        .select()
        .from(pods)
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .where(and(eq(pods.id, input.id), eq(teamMembers.userId, userId)))
        .limit(1);

      if (!pod) {
        throw new Error("Pod not found or access denied");
      }

      return pod.pod;
    }),

  start: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx.session.user as any).id;

      // Check access
      const [pod] = await ctx.db
        .select()
        .from(pods)
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .where(and(eq(pods.id, input.id), eq(teamMembers.userId, userId)))
        .limit(1);

      if (!pod) {
        throw new Error("Pod not found or access denied");
      }

      // Update status to starting
      await ctx.db
        .update(pods)
        .set({
          status: "starting",
        })
        .where(eq(pods.id, input.id));

      // TODO: Actually start the container
      // Simulate starting
      setTimeout(async () => {
        try {
          await ctx.db
            .update(pods)
            .set({
              status: "running",
              lastStartedAt: new Date(),
            })
            .where(eq(pods.id, input.id));
        } catch (error) {
          console.error("Failed to start pod:", error);
        }
      }, 3000);

      return { success: true };
    }),

  stop: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx.session.user as any).id;

      // Check access
      const [pod] = await ctx.db
        .select()
        .from(pods)
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .where(and(eq(pods.id, input.id), eq(teamMembers.userId, userId)))
        .limit(1);

      if (!pod) {
        throw new Error("Pod not found or access denied");
      }

      // Update status to stopping
      await ctx.db
        .update(pods)
        .set({
          status: "stopping",
        })
        .where(eq(pods.id, input.id));

      // TODO: Actually stop the container
      // Simulate stopping
      setTimeout(async () => {
        try {
          await ctx.db
            .update(pods)
            .set({
              status: "stopped",
              lastStoppedAt: new Date(),
            })
            .where(eq(pods.id, input.id));
        } catch (error) {
          console.error("Failed to stop pod:", error);
        }
      }, 2000);

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx.session.user as any).id;

      // Check access and ownership
      const [pod] = await ctx.db
        .select()
        .from(pods)
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .where(
          and(
            eq(pods.id, input.id),
            eq(teamMembers.userId, userId),
            eq(pods.ownerId, userId), // Only owner can delete
          ),
        )
        .limit(1);

      if (!pod) {
        throw new Error("Pod not found or permission denied");
      }

      // TODO: Actually destroy the container

      // Delete from database
      await ctx.db.delete(pods).where(eq(pods.id, input.id));

      return { success: true };
    }),
});
