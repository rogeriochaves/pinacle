import { Octokit } from "@octokit/rest";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, isNull, not } from "drizzle-orm";
import { z } from "zod";
import {
  envSets,
  githubInstallations,
  podLogs,
  podMetrics,
  pods,
  servers,
  teamMembers,
  userGithubInstallations,
} from "../../db/schema";
import { getInstallationOctokit } from "../../github-app";
import {
  generatePinacleConfigFromForm,
  pinacleConfigToJSON,
} from "../../pod-orchestration/pinacle-config";
import { PodProvisioningService } from "../../pod-orchestration/pod-provisioning-service";
import { getResourceTierUnsafe } from "../../pod-orchestration/resource-tier-registry";
import {
  SERVICE_TEMPLATES,
  type ServiceId,
} from "../../pod-orchestration/service-registry";
import {
  POD_TEMPLATES,
  type TemplateId,
} from "../../pod-orchestration/template-registry";
import { getNextAvailableServer } from "../../servers";
import { generateKSUID } from "../../utils";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../server";

const createPodSchema = z.object({
  name: z.string().min(2).max(255).optional(), // Auto-generated if not provided
  description: z.string().optional(),
  template: z
    .enum(Object.keys(POD_TEMPLATES) as [TemplateId, ...TemplateId[]])
    .optional(),
  teamId: z.string(),

  // GitHub repository information
  githubRepo: z.string().optional(), // owner/repo format
  githubBranch: z.string().optional(),
  isNewProject: z.boolean().default(false),

  // New repository creation fields (when isNewProject is true)
  newRepoName: z.string().optional(), // name for new repository
  selectedOrg: z.string().optional(), // organization to create repo in

  // Resource specifications - tier only, resources are derived from tier
  tier: z
    .enum(["dev.small", "dev.medium", "dev.large", "dev.xlarge"])
    .default("dev.small"),

  // Service selection
  customServices: z
    .array(
      z.enum(Object.keys(SERVICE_TEMPLATES) as [ServiceId, ...ServiceId[]]),
    )
    .optional(), // Custom service selection

  // Configuration
  config: z.record(z.string(), z.unknown()).optional(), // pinacle.yaml config as object
  envVars: z.record(z.string(), z.string()).optional(), // environment variables
});

export const podsRouter = createTRPCRouter({
  getTemplates: publicProcedure.query(async () => {
    const templates = POD_TEMPLATES;

    return templates;
  }),

  create: protectedProcedure
    .input(createPodSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        name: inputName,
        description,
        template,
        teamId,
        githubRepo,
        githubBranch,
        isNewProject,
        newRepoName,
        selectedOrg,
        tier,
        customServices,
        envVars,
      } = input;
      const userId = ctx.session.user.id;

      // Auto-generate pod name if not provided
      const podId = generateKSUID("pod");
      let name = inputName;
      if (!name) {
        const baseName = isNewProject
          ? newRepoName || "pod"
          : githubRepo?.split("/")[1] || "pod";
        const randomSuffix = podId.slice(podId.length - 5);
        name = `${baseName}-${randomSuffix}`;
      }

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

          console.log("🔍 Debug GitHub App Installation:");
          console.log(
            "Available installations:",
            userInstallations.map((inst) => ({
              login: inst.accountLogin,
              type: inst.accountType,
              installationId: inst.installationId,
            })),
          );
          console.log("Looking for selectedOrg:", selectedOrg);
          console.log("Found targetInstallation:", targetInstallation);

          if (!targetInstallation) {
            throw new Error(
              `GitHub App is not installed on ${selectedOrg}. Please install the app first.`,
            );
          }

          // Choose the right token based on account type
          let octokit:
            | Octokit
            | Awaited<ReturnType<typeof getInstallationOctokit>>;
          if (targetInstallation.accountType === "Organization") {
            // Use GitHub App installation token for organizations
            console.log(
              "🔑 Using GitHub App installation token for organization",
            );
            octokit = await getInstallationOctokit(
              targetInstallation.installationId,
            );
          } else {
            // Use user's OAuth token for personal accounts
            console.log("🔑 Using user's OAuth token for personal account");
            const userGithubToken = ctx.session.user.githubAccessToken;

            if (!userGithubToken) {
              throw new Error(
                "User's GitHub OAuth token not found. Please sign out and sign in again.",
              );
            }

            octokit = new Octokit({ auth: userGithubToken });
          }

          const repoData = {
            name: newRepoName,
            description: `Development project created with Pinacle`,
            private: true,
            auto_init: false,
          };

          console.log("🏗️ Creating repository:");
          console.log("Account type:", targetInstallation.accountType);
          console.log("Selected org:", selectedOrg);
          console.log("Repo data:", repoData);

          let repository: { full_name: string };
          if (targetInstallation.accountType === "Organization") {
            // Create in organization
            console.log(
              "📁 Using organization endpoint: POST /orgs/{org}/repos",
            );
            const { data } = await octokit.request("POST /orgs/{org}/repos", {
              org: selectedOrg,
              ...repoData,
            });
            repository = data;
          } else {
            // Create in user account
            console.log("👤 Using user endpoint: POST /user/repos");
            console.log("📡 Making request with headers:", {
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
            });

            const { data } = await octokit.request("POST /user/repos", {
              ...repoData,
              headers: {
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
              },
            });
            repository = data;
          }

          console.log(
            "✅ Repository created successfully:",
            repository.full_name,
          );

          finalGithubRepo = repository.full_name;
        } catch (error) {
          console.error("Failed to create repository:", error);

          const status =
            typeof error === "object" && error !== null && "status" in error
              ? (error as Record<string, unknown>).status
              : undefined;
          const message =
            error instanceof Error ? error.message : String(error);

          if (status === 403) {
            throw new Error(
              `Cannot create repository. The GitHub App needs 'Contents' and 'Administration' permissions. ` +
                `Please update the app permissions and reinstall it.`,
            );
          }

          if (status === 404) {
            throw new Error(
              `Cannot create repository. This might be because: ` +
                `1) The GitHub App doesn't have 'Contents' or 'Administration' permissions, ` +
                `2) The app is not installed on ${selectedOrg}, or ` +
                `3) The organization doesn't exist.`,
            );
          }

          throw new Error(`Failed to create repository: ${message}`);
        }
      }

      // Calculate pricing based on tier from resource tier registry
      const resourceTier = getResourceTierUnsafe(tier);
      if (!resourceTier) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid resource tier",
        });
      }
      const monthlyPrice = resourceTier.price * 100; // in cents

      // Generate slug from name
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      // Update: Generate PinacleConfig with slug so tabs can be generated
      const pinacleConfig = generatePinacleConfigFromForm({
        template,
        tier,
        customServices,
        slug,
      });
      const configJSON = pinacleConfigToJSON(pinacleConfig);

      // Create env set and pod in a transaction
      const pod = await ctx.db.transaction(async (tx) => {
        // Create env set if there are environment variables
        let envSetId: string | undefined;
        if (envVars && Object.keys(envVars).length > 0) {
          const [envSet] = await tx
            .insert(envSets)
            .values({
              id: generateKSUID("env_set"),
              name: `${name}-env`,
              description: `Environment variables for ${name}`,
              ownerId: userId,
              teamId,
              variables: JSON.stringify(envVars),
            })
            .returning();
          envSetId = envSet.id;
        }

        // Create pod with env set reference
        const [newPod] = await tx
          .insert(pods)
          .values({
            id: podId,
            name,
            slug,
            description,
            template,
            teamId,
            ownerId: userId,
            githubRepo: finalGithubRepo,
            githubBranch,
            isNewProject,
            config: configJSON, // Store the validated PinacleConfig
            envSetId, // Attach env set if created
            monthlyPrice,
            status: "creating",
          })
          .returning();

        return newPod;
      });

      // Kick off provisioning asynchronously (fire and forget)
      // Don't await - let it run in background
      (async () => {
        try {
          console.log(
            `[pods.create] Starting async provisioning for pod: ${pod.id}`,
          );

          // Auto-select a server for provisioning
          const availableServer = await getNextAvailableServer();

          if (!availableServer) {
            throw new Error("No available servers found");
          }

          const provisioningService = new PodProvisioningService();

          // Set up 30 minute timeout
          const timeoutMs = 30 * 60 * 1000; // 30 minutes
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error("Provisioning timed out after 30 minutes"));
            }, timeoutMs);
          });

          // Race between provisioning and timeout
          await Promise.race([
            provisioningService.provisionPod({
              podId: pod.id,
              serverId: availableServer.id,
            }),
            timeoutPromise,
          ]);

          console.log(`[pods.create] Successfully provisioned pod: ${pod.id}`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[pods.create] Failed to provision pod ${pod.id}:`,
            errorMessage,
          );

          // Update pod status to error
          try {
            await ctx.db
              .update(pods)
              .set({
                status: "error",
                updatedAt: new Date(),
              })
              .where(eq(pods.id, pod.id));
          } catch (updateError) {
            console.error(
              `[pods.create] Failed to update pod status to error:`,
              updateError,
            );
          }
        }
      })();

      return pod;
    }),

  getUserPods: protectedProcedure
    .input(
      z
        .object({
          includeArchived: z.boolean().default(false),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const includeArchived = input?.includeArchived ?? false;

      // Get all pods where user is a team member, ordered by creation date (newest first)
      const userPods = await ctx.db
        .select({
          id: pods.id,
          name: pods.name,
          slug: pods.slug,
          description: pods.description,
          status: pods.status,
          config: pods.config,
          monthlyPrice: pods.monthlyPrice,
          publicUrl: pods.publicUrl,
          createdAt: pods.createdAt,
          lastStartedAt: pods.lastStartedAt,
          archivedAt: pods.archivedAt,
          teamId: pods.teamId,
        })
        .from(pods)
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .where(
          and(
            eq(teamMembers.userId, userId),
            // Filter out archived pods unless explicitly requested
            includeArchived ? undefined : isNull(pods.archivedAt),
          ),
        )
        .orderBy(desc(pods.createdAt)); // Newest pods first

      return userPods;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

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
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

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
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

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
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check access and ownership
      const [result] = await ctx.db
        .select({
          pod: pods,
          server: servers,
        })
        .from(pods)
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .leftJoin(servers, eq(pods.serverId, servers.id))
        .where(
          and(
            eq(pods.id, input.id),
            eq(teamMembers.userId, userId),
            eq(pods.ownerId, userId), // Only owner can delete
          ),
        )
        .limit(1);

      if (!result) {
        throw new Error("Pod not found or permission denied");
      }

      const { pod } = result;

      // Deprovision the pod - stops and removes container, cleans up network
      // This must succeed - if cleanup fails, we throw an error
      const { PodProvisioningService } = await import(
        "../../pod-orchestration/pod-provisioning-service"
      );
      const provisioningService = new PodProvisioningService();
      await provisioningService.deprovisionPod({ podId: pod.id });

      // Soft delete by setting archivedAt timestamp
      await ctx.db
        .update(pods)
        .set({
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pods.id, input.id));

      console.log(`[pods.delete] Archived pod: ${pod.id}`);

      return { success: true };
    }),

  // Get latest metrics for a pod
  getMetrics: protectedProcedure
    .input(z.object({ podId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user has access to this pod
      const [pod] = await ctx.db
        .select()
        .from(pods)
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .where(and(eq(pods.id, input.podId), eq(teamMembers.userId, userId)))
        .limit(1);

      if (!pod) {
        throw new Error("Pod not found or access denied");
      }

      // Get latest metrics
      const [latestMetric] = await ctx.db
        .select()
        .from(podMetrics)
        .where(eq(podMetrics.podId, input.podId))
        .orderBy(desc(podMetrics.timestamp))
        .limit(1);

      return latestMetric || null;
    }),

  // Get pod metrics history
  getMetricsHistory: protectedProcedure
    .input(
      z.object({
        podId: z.string(),
        hoursAgo: z.number().min(1).max(168).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user has access to this pod
      const [pod] = await ctx.db
        .select()
        .from(pods)
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .where(and(eq(pods.id, input.podId), eq(teamMembers.userId, userId)))
        .limit(1);

      if (!pod) {
        throw new Error("Pod not found or access denied");
      }

      const since = new Date(Date.now() - input.hoursAgo * 60 * 60 * 1000);

      const metrics = await ctx.db
        .select()
        .from(podMetrics)
        .where(
          and(
            eq(podMetrics.podId, input.podId),
            gte(podMetrics.timestamp, since),
          ),
        )
        .orderBy(podMetrics.timestamp);

      return metrics;
    }),

  // Get pod provisioning logs
  getLogs: protectedProcedure
    .input(
      z.object({
        podId: z.string(),
        lines: z.number().min(1).max(1000).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user has access to this pod
      const [pod] = await ctx.db
        .select()
        .from(pods)
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .where(and(eq(pods.id, input.podId), eq(teamMembers.userId, userId)))
        .limit(1);

      if (!pod) {
        throw new Error("Pod not found or access denied");
      }

      const logs = await ctx.db
        .select()
        .from(podLogs)
        .where(eq(podLogs.podId, input.podId))
        .orderBy(desc(podLogs.timestamp))
        .limit(input.lines);

      // Format logs as strings
      return logs.reverse().map((log) => {
        const prefix = log.label ? `${log.label} ` : "";
        const output = log.stdout || log.stderr || "";
        return `${prefix}${output}`.trim();
      });
    }),

  // Get pod status with logs for polling (used during provisioning)
  getStatusWithLogs: protectedProcedure
    .input(
      z.object({
        podId: z.string(),
        lastLogId: z.string().optional(), // For incremental log fetching
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user has access to this pod and get status
      const [result] = await ctx.db
        .select({
          id: pods.id,
          name: pods.name,
          status: pods.status,
          containerId: pods.containerId,
          publicUrl: pods.publicUrl,
          createdAt: pods.createdAt,
          updatedAt: pods.updatedAt,
          lastStartedAt: pods.lastStartedAt,
          lastErrorMessage: pods.lastErrorMessage,
        })
        .from(pods)
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .where(and(eq(pods.id, input.podId), eq(teamMembers.userId, userId)))
        .limit(1);

      if (!result) {
        throw new Error("Pod not found or access denied");
      }

      // Get container logs (only new ones if lastLogId provided)
      let logsQuery = ctx.db
        .select()
        .from(podLogs)
        .where(
          and(
            eq(podLogs.podId, input.podId),
            not(isNull(podLogs.containerCommand)),
          ),
        )
        .orderBy(podLogs.timestamp)
        .limit(100);

      // If lastLogId provided, only fetch logs after that ID
      if (input.lastLogId) {
        const [lastLog] = await ctx.db
          .select()
          .from(podLogs)
          .where(eq(podLogs.id, input.lastLogId))
          .limit(1);

        if (lastLog) {
          logsQuery = ctx.db
            .select()
            .from(podLogs)
            .where(
              and(
                eq(podLogs.podId, input.podId),
                gte(podLogs.timestamp, lastLog.timestamp),
                not(isNull(podLogs.containerCommand)),
              ),
            )
            .orderBy(podLogs.timestamp)
            .limit(100);
        }
      }

      const logs = await logsQuery;

      return {
        pod: result,
        logs: logs.map((log) => ({
          id: log.id,
          timestamp: log.timestamp,
          label: log.label,
          stdout: log.stdout,
          stderr: log.stderr,
          exitCode: log.exitCode,
          containerCommand: log.containerCommand,
        })),
      };
    }),

  // Retry failed pod provisioning
  retryProvisioning: protectedProcedure
    .input(z.object({ podId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user has access to this pod
      const [result] = await ctx.db
        .select()
        .from(pods)
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .where(and(eq(pods.id, input.podId), eq(teamMembers.userId, userId)))
        .limit(1);

      if (!result) {
        throw new Error("Pod not found or access denied");
      }

      const pod = result.pod;

      // Only allow retry if pod is in error state
      if (pod.status !== "error") {
        throw new Error(
          `Can only retry failed provisioning. Current status: ${pod.status}`,
        );
      }

      // Update status back to creating
      await ctx.db
        .update(pods)
        .set({
          status: "creating",
          updatedAt: new Date(),
        })
        .where(eq(pods.id, input.podId));

      // Kick off provisioning again (same logic as create)
      (async () => {
        try {
          console.log(
            `[retryProvisioning] Starting retry for pod: ${input.podId}`,
          );

          // Auto-select a server for provisioning
          const availableServer = await getNextAvailableServer();

          if (!availableServer) {
            throw new Error("No available servers found");
          }

          const provisioningService = new PodProvisioningService();

          // Try to cleanup the pod if it was previously provisioned
          if (pod.serverId) {
            await provisioningService.cleanupPod({
              podId: input.podId,
              serverId: pod.serverId,
            });
          }

          // Set up 30 minute timeout
          const timeoutMs = 30 * 60 * 1000; // 30 minutes
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error("Provisioning timed out after 30 minutes"));
            }, timeoutMs);
          });

          // Race between provisioning and timeout
          await Promise.race([
            provisioningService.provisionPod({
              podId: input.podId,
              serverId: availableServer.id,
            }),
            timeoutPromise,
          ]);

          console.log(
            `[retryProvisioning] Successfully provisioned pod: ${input.podId}`,
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[retryProvisioning] Failed to provision pod ${input.podId}:`,
            errorMessage,
          );

          // Update pod status to error
          try {
            await ctx.db
              .update(pods)
              .set({
                status: "error",
                lastErrorMessage: errorMessage?.split(":")?.[0],
                updatedAt: new Date(),
              })
              .where(eq(pods.id, input.podId));
          } catch (updateError) {
            console.error(
              `[retryProvisioning] Failed to update pod status to error:`,
              updateError,
            );
          }

          throw error;
        }
      })();

      return { success: true, message: "Provisioning retry started" };
    }),
});
