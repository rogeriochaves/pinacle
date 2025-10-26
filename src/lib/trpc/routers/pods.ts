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
import type { GitHubRepoSetup } from "../../pod-orchestration/github-integration";
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

  // Tabs configuration (for existing pinacle.yaml)
  tabs: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().optional(),
        service: z.string().optional(),
      }),
    )
    .optional(),

  // Configuration
  config: z.record(z.string(), z.unknown()).optional(), // pinacle.yaml config as object
  envVars: z.record(z.string(), z.string()).optional(), // environment variables

  // Process configuration (for existing repos)
  processConfig: z
    .object({
      installCommand: z.string().optional(),
      startCommand: z.string().optional(),
      appUrl: z.string().optional(),
    })
    .optional(),
  
  // Flag to indicate if existing repo already has pinacle.yaml
  // When true, we won't inject a new pinacle.yaml file
  hasPinacleYaml: z.boolean().optional(),
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
        tabs,
        envVars,
        processConfig,
        hasPinacleYaml,
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

          if (status === 401) {
            throw new Error(
              "GITHUB_AUTH_EXPIRED: Your GitHub authentication has expired. Please sign out and sign in again to reconnect your GitHub account.",
            );
          }

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
      const slug = name.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

      // Update: Generate PinacleConfig with slug so tabs can be generated
      const pinacleConfig = generatePinacleConfigFromForm({
        template,
        tier,
        customServices,
        tabs,
        slug,
        processConfig,
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

          // Set up GitHub repository if configured
          let githubRepoSetup: GitHubRepoSetup | undefined;
          if (finalGithubRepo) {
            try {
              const { setupGitHubRepoForPod } = await import(
                "../../github-helpers"
              );

              githubRepoSetup = await setupGitHubRepoForPod({
                podId: pod.id,
                podName: pod.name,
                userId,
                repository: finalGithubRepo,
                branch: githubBranch,
                isNewProject,
                userGithubToken: ctx.session.user.githubAccessToken,
              });

              // Store the deploy key ID in the database for cleanup later
              await ctx.db
                .update(pods)
                .set({ githubDeployKeyId: githubRepoSetup.deployKeyId })
                .where(eq(pods.id, pod.id));

              console.log(
                `[pods.create] GitHub setup complete for ${finalGithubRepo}`,
              );
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              console.error(
                `[pods.create] Failed to set up GitHub repository: ${errorMessage}`,
              );

              // Store the error message in the database so UI can display it
              await ctx.db
                .update(pods)
                .set({
                  lastErrorMessage: errorMessage,
                  status: "error",
                  updatedAt: new Date(),
                })
                .where(eq(pods.id, pod.id));

              throw new Error(
                `Failed to set up GitHub repository: ${errorMessage}`,
              );
            }
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
              githubRepoSetup,
              hasPinacleYaml,
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

          // Update pod status to error (only if not already set by GitHub error handler)
          try {
            // Check current pod state first
            const currentPod = await ctx.db
              .select()
              .from(pods)
              .where(eq(pods.id, pod.id))
              .limit(1);

            // Only update if there's no error message already (to preserve more specific errors)
            if (currentPod[0] && !currentPod[0].lastErrorMessage) {
              await ctx.db
                .update(pods)
                .set({
                  status: "error",
                  lastErrorMessage: errorMessage,
                  updatedAt: new Date(),
                })
                .where(eq(pods.id, pod.id));
            } else if (currentPod[0] && currentPod[0].status !== "error") {
              // If there's already an error message, just update status
              await ctx.db
                .update(pods)
                .set({
                  status: "error",
                  updatedAt: new Date(),
                })
                .where(eq(pods.id, pod.id));
            }
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
          uiState: pods.uiState,
          monthlyPrice: pods.monthlyPrice,
          publicUrl: pods.publicUrl,
          lastErrorMessage: pods.lastErrorMessage,
          createdAt: pods.createdAt,
          lastStartedAt: pods.lastStartedAt,
          lastHeartbeatAt: pods.lastHeartbeatAt,
          archivedAt: pods.archivedAt,
          teamId: pods.teamId,
          githubRepo: pods.githubRepo,
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

      // Mark pods as stopped if they haven't sent a heartbeat in 60 seconds
      // This is done in-memory rather than updating the DB to avoid race conditions
      const now = Date.now();
      const HEARTBEAT_TIMEOUT_MS = 60 * 1000; // 60 seconds
      const STARTUP_GRACE_PERIOD_MS = 120 * 1000; // 2 minutes grace period for newly started pods

      const podsWithComputedStatus = userPods.map((pod) => {
        // If pod status is running but hasn't sent heartbeat in 60 seconds, mark as stopped
        // UNLESS it was recently started (give it time to send first heartbeat)
        if (pod.status === "running" && pod.lastHeartbeatAt) {
          const timeSinceHeartbeat = now - pod.lastHeartbeatAt.getTime();
          const timeSinceStart = pod.lastStartedAt
            ? now - pod.lastStartedAt.getTime()
            : Number.POSITIVE_INFINITY;

          // Only mark as stopped if:
          // 1. No heartbeat for 60s AND
          // 2. Not recently started (outside grace period)
          if (
            timeSinceHeartbeat > HEARTBEAT_TIMEOUT_MS &&
            timeSinceStart > STARTUP_GRACE_PERIOD_MS
          ) {
            return { ...pod, status: "stopped" as const };
          }
        }
        return pod;
      });

      return podsWithComputedStatus;
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

      // Check access and get pod with server
      const [result] = await ctx.db
        .select({
          pod: pods,
          server: servers,
        })
        .from(pods)
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .leftJoin(servers, eq(pods.serverId, servers.id))
        .where(and(eq(pods.id, input.id), eq(teamMembers.userId, userId)))
        .limit(1);

      if (!result) {
        throw new Error("Pod not found or access denied");
      }

      const { pod, server } = result;

      if (!pod.serverId || !server) {
        throw new Error("Pod is not assigned to a server");
      }

      const serverId = pod.serverId; // Store for async closure

      // Update status to starting
      await ctx.db
        .update(pods)
        .set({
          status: "starting",
          updatedAt: new Date(),
        })
        .where(eq(pods.id, input.id));

      // Start the container asynchronously
      (async () => {
        try {
          console.log(`[pods.start] Starting pod ${input.id}`);

          const { PodProvisioningService } = await import(
            "../../pod-orchestration/pod-provisioning-service"
          );
          const provisioningService = new PodProvisioningService();
          const serverConnection =
            await provisioningService.getServerConnectionDetails(serverId);

          // Recreate if pod has no containerId in DB
          // This means either:
          // 1. Pod was never started, OR
          // 2. Previous start failed before completing snapshot restore
          // If containerId exists in DB, the pod was fully set up and we just start it
          if (!pod.containerId) {
            console.log(
              `[pods.start] No containerId in DB for ${input.id}, need to recreate and restore snapshot...`,
            );

            // Use shared helper to recreate pod with snapshot
            const { recreatePodWithSnapshot } = await import(
              "../helpers/pod-recreate-helper"
            );

            const result = await recreatePodWithSnapshot({
              pod,
              serverConnection,
              snapshotId: null, // null = use latest snapshot
              db: ctx.db,
            });

            // Only save containerId and ports to DB after successful restore
            // This way, if restore fails, we'll recreate on next start attempt
            await ctx.db
              .update(pods)
              .set({
                containerId: result.containerId,
                ports: result.ports, // Update ports for proxy routing
                updatedAt: new Date(),
              })
              .where(eq(pods.id, input.id));

            console.log(
              `[pods.start] Successfully set up container ${result.containerId} for pod ${input.id}`,
            );
          } else {
            // Container exists, just start it
            const { PodManager } = await import(
              "../../pod-orchestration/pod-manager"
            );
            const podManager = new PodManager(input.id, serverConnection);
            await podManager.startPod();
          }

          // After container is running, restart all services and processes
          console.log(
            `[pods.start] Restarting services and processes for pod ${input.id}`,
          );
          const { ServiceProvisioner } = await import(
            "../../pod-orchestration/service-provisioner"
          );
          const { ProcessProvisioner } = await import(
            "../../pod-orchestration/process-provisioner"
          );
          const { expandPinacleConfigToSpec } = await import(
            "../../pod-orchestration/pinacle-config"
          );

          // Get pod config to know which services and processes to restart
          const pinacleConfig = JSON.parse(pod.config);
          const podSpec = await expandPinacleConfigToSpec(pinacleConfig, {
            id: pod.id,
            name: pod.name,
            slug: pod.slug,
            description: pod.description || undefined,
            githubRepo: pod.githubRepo || undefined,
            githubBranch: pod.githubBranch || undefined,
          });

          const serviceProvisioner = new ServiceProvisioner(
            input.id,
            serverConnection,
          );
          const processProvisioner = new ProcessProvisioner(
            input.id,
            serverConnection,
          );

          // Restart all user processes (tmux sessions)
          if (podSpec.processes && podSpec.processes.length > 0) {
            for (const process of podSpec.processes) {
              try {
                console.log(`[pods.start] Starting process: ${process.name}`);
                await processProvisioner.startProcess(podSpec, process);
              } catch (error) {
                console.warn(
                  `[pods.start] Failed to start process ${process.name}:`,
                  error,
                );
                // Continue with other processes even if one fails
              }
            }
          }

          // Restart all services (OpenRC services)
          for (const service of podSpec.services) {
            if (service.enabled) {
              try {
                console.log(`[pods.start] Starting service: ${service.name}`);
                await serviceProvisioner.startService({
                  spec: podSpec,
                  podId: input.id,
                  serviceName: service.name,
                });
              } catch (error) {
                console.warn(
                  `[pods.start] Failed to start service ${service.name}:`,
                  error,
                );
                // Continue with other services even if one fails
              }
            }
          }

          // Wait a moment for services and processes to start
          await new Promise((resolve) => setTimeout(resolve, 5_000));

          await ctx.db
            .update(pods)
            .set({
              status: "running",
              lastStartedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(pods.id, input.id));

          console.log(`[pods.start] Successfully started pod ${input.id}`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(`[pods.start] Failed to start pod ${input.id}:`, error);

          await ctx.db
            .update(pods)
            .set({
              status: "error",
              lastErrorMessage: errorMessage,
              updatedAt: new Date(),
            })
            .where(eq(pods.id, input.id));
        }
      })();

      return { success: true };
    }),

  stop: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check access and get pod with server
      const [result] = await ctx.db
        .select({
          pod: pods,
          server: servers,
        })
        .from(pods)
        .innerJoin(teamMembers, eq(pods.teamId, teamMembers.teamId))
        .leftJoin(servers, eq(pods.serverId, servers.id))
        .where(and(eq(pods.id, input.id), eq(teamMembers.userId, userId)))
        .limit(1);

      if (!result) {
        throw new Error("Pod not found or access denied");
      }

      const { pod, server } = result;

      if (!pod.serverId || !server) {
        throw new Error("Pod is not assigned to a server");
      }

      // If pod has no container, it's already stopped - just update status
      if (!pod.containerId) {
        await ctx.db
          .update(pods)
          .set({
            status: "stopped",
            updatedAt: new Date(),
          })
          .where(eq(pods.id, input.id));
        return { success: true };
      }

      const serverId = pod.serverId; // Store for async closure

      // Update status to stopping
      await ctx.db
        .update(pods)
        .set({
          status: "stopping",
          updatedAt: new Date(),
        })
        .where(eq(pods.id, input.id));

      // Stop the container asynchronously
      (async () => {
        try {
          console.log(`[pods.stop] Stopping pod ${input.id}`);

          const { PodProvisioningService } = await import(
            "../../pod-orchestration/pod-provisioning-service"
          );
          const provisioningService = new PodProvisioningService();
          const serverConnection =
            await provisioningService.getServerConnectionDetails(serverId);

          // Create auto-snapshot before stopping (capture running state)
          // This is critical - without a snapshot, the user will lose all their data
          if (pod.containerId && pod.status === "running") {
            try {
              console.log(
                `[pods.stop] Creating auto-snapshot for pod ${input.id}`,
              );
              const { SnapshotService } = await import(
                "../../snapshots/snapshot-service"
              );
              const snapshotService = new SnapshotService();

              const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
              await snapshotService.createSnapshot({
                podId: input.id,
                serverConnection,
                containerId: pod.containerId,
                name: `auto-${timestamp}`,
                description: "Auto-created on pod stop",
                isAuto: true,
              });
              console.log(
                `[pods.stop] Auto-snapshot created for pod ${input.id}`,
              );
            } catch (snapshotError) {
              const errorMessage =
                snapshotError instanceof Error
                  ? snapshotError.message
                  : String(snapshotError);
              console.error(
                `[pods.stop] Failed to create snapshot for pod ${input.id}:`,
                snapshotError,
              );

              // Revert pod status back to running since we didn't actually stop the container
              await ctx.db
                .update(pods)
                .set({
                  status: "running",
                  lastErrorMessage: `Snapshot creation failed: ${errorMessage}`,
                  updatedAt: new Date(),
                })
                .where(eq(pods.id, input.id));

              // Don't continue with stopping - the container is still running
              throw snapshotError;
            }
          }

          const { PodManager } = await import(
            "../../pod-orchestration/pod-manager"
          );
          const podManager = new PodManager(input.id, serverConnection);

          // Stop the container
          await podManager.stopPod();

          // Remove the stopped container AND volumes - user stop = full deprovisioning
          // Snapshot was already created above, so all data is safely backed up
          // On restart, we'll restore from snapshot
          const container = await podManager.getPodContainer();
          if (container) {
            console.log(
              `[pods.stop] Removing stopped container ${container.id} AND volumes (full deprovision)`,
            );
            const { GVisorRuntime } = await import(
              "../../pod-orchestration/container-runtime"
            );
            const runtime = new GVisorRuntime(serverConnection);
            // removeVolumes defaults to true
            await runtime.removeContainer(container.id);
          }

          // Clear container ID from DB
          await ctx.db
            .update(pods)
            .set({
              status: "stopped",
              containerId: null,
              lastStoppedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(pods.id, input.id));

          console.log(
            `[pods.stop] Successfully stopped, removed container, and deleted volumes for pod ${input.id}`,
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(`[pods.stop] Failed to stop pod ${input.id}:`, error);

          // Only set to error if it's not a snapshot error (those are handled above)
          // Check if the error came from the snapshot creation by checking the current pod status
          const [currentPod] = await ctx.db
            .select()
            .from(pods)
            .where(eq(pods.id, input.id))
            .limit(1);

          if (currentPod && currentPod.status !== "running") {
            // If status is not "running", it means we got past the snapshot step
            // and failed during the actual stop/remove, so set to error
            await ctx.db
              .update(pods)
              .set({
                status: "error",
                lastErrorMessage: errorMessage,
                updatedAt: new Date(),
              })
              .where(eq(pods.id, input.id));
          }
          // If status is "running", we already handled the snapshot error above
        }
      })();

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

      // Update status to deleting immediately for UX
      await ctx.db
        .update(pods)
        .set({
          status: "deleting",
          updatedAt: new Date(),
        })
        .where(eq(pods.id, input.id));

      // Perform deletion asynchronously
      (async () => {
        try {
          console.log(`[pods.delete] Deleting pod ${input.id}`);

          // Deprovision the pod - stops and removes container, cleans up network
          const { PodProvisioningService } = await import(
            "../../pod-orchestration/pod-provisioning-service"
          );
          const provisioningService = new PodProvisioningService();
          await provisioningService.deprovisionPod({ podId: pod.id });

          // Remove GitHub deploy key if one exists
          if (pod.githubRepo && pod.githubDeployKeyId) {
            try {
              const { getOctokitForRepo, removeDeployKeyFromRepo } =
                await import("../../github-helpers");
              const octokit = await getOctokitForRepo(
                userId,
                pod.githubRepo,
                ctx.session.user.githubAccessToken,
              );
              await removeDeployKeyFromRepo(
                octokit,
                pod.githubRepo,
                pod.githubDeployKeyId,
              );
              console.log(
                `[pods.delete] Removed deploy key ${pod.githubDeployKeyId} from ${pod.githubRepo}`,
              );
            } catch (error) {
              // Log but don't fail the deletion - the key might already be gone
              console.warn(
                `[pods.delete] Could not remove deploy key: ${error}`,
              );
            }
          }

          // Clean up all snapshots for this pod
          try {
            console.log(
              `[pods.delete] Cleaning up snapshots for pod ${input.id}`,
            );
            const { SnapshotService } = await import(
              "../../snapshots/snapshot-service"
            );
            const { PodProvisioningService } = await import(
              "../../pod-orchestration/pod-provisioning-service"
            );

            const snapshotService = new SnapshotService();
            const allSnapshots = await snapshotService.listSnapshots(input.id);

            if (allSnapshots.length > 0 && pod.serverId) {
              const provisioningService = new PodProvisioningService();
              const serverConnection =
                await provisioningService.getServerConnectionDetails(
                  pod.serverId,
                );

              for (const snapshot of allSnapshots) {
                try {
                  await snapshotService.deleteSnapshot(
                    snapshot.id,
                    serverConnection,
                  );
                  console.log(
                    `[pods.delete] Deleted snapshot ${snapshot.id} (${snapshot.name})`,
                  );
                } catch (snapshotError) {
                  // Log but don't fail pod deletion if snapshot cleanup fails
                  console.warn(
                    `[pods.delete] Failed to delete snapshot ${snapshot.id}:`,
                    snapshotError,
                  );
                }
              }
            }
            console.log(
              `[pods.delete] Cleaned up ${allSnapshots.length} snapshot(s) for pod ${input.id}`,
            );
          } catch (error) {
            // Log but don't fail the deletion if snapshot cleanup fails
            console.warn(
              `[pods.delete] Could not clean up snapshots: ${error}`,
            );
          }

          // Soft delete by setting archivedAt timestamp
          await ctx.db
            .update(pods)
            .set({
              archivedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(pods.id, input.id));

          console.log(`[pods.delete] Successfully archived pod ${input.id}`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[pods.delete] Failed to delete pod ${input.id}:`,
            error,
          );

          // Set error state if deletion fails
          await ctx.db
            .update(pods)
            .set({
              status: "error",
              lastErrorMessage: `Deletion failed: ${errorMessage}`,
              updatedAt: new Date(),
            })
            .where(eq(pods.id, input.id));
        }
      })();

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

          // Set up GitHub repository if configured
          let githubRepoSetup: GitHubRepoSetup | undefined;
          if (pod.githubRepo) {
            try {
              const {
                setupGitHubRepoForPod,
                getOctokitForRepo,
                removeDeployKeyFromRepo,
              } = await import("../../github-helpers");

              // Remove old deploy key if it exists
              if (pod.githubDeployKeyId) {
                try {
                  const octokit = await getOctokitForRepo(
                    userId,
                    pod.githubRepo,
                    ctx.session.user.githubAccessToken,
                  );
                  await removeDeployKeyFromRepo(
                    octokit,
                    pod.githubRepo,
                    pod.githubDeployKeyId,
                  );
                  console.log(
                    `[retryProvisioning] Removed old deploy key ${pod.githubDeployKeyId}`,
                  );
                } catch (error) {
                  // Log but don't fail - the key might already be deleted
                  console.warn(
                    `[retryProvisioning] Could not remove old deploy key: ${error}`,
                  );
                }
              }

              // Create new deploy key
              githubRepoSetup = await setupGitHubRepoForPod({
                podId: input.podId,
                podName: pod.name,
                userId,
                repository: pod.githubRepo,
                branch: pod.githubBranch || undefined,
                isNewProject: pod.isNewProject || false,
                userGithubToken: ctx.session.user.githubAccessToken,
              });

              // Store the new deploy key ID
              await ctx.db
                .update(pods)
                .set({ githubDeployKeyId: githubRepoSetup.deployKeyId })
                .where(eq(pods.id, input.podId));

              console.log(
                `[retryProvisioning] GitHub setup complete for ${pod.githubRepo}`,
              );
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              console.error(
                `[retryProvisioning] Failed to set up GitHub repository: ${errorMessage}`,
              );
              throw new Error(
                `Failed to set up GitHub repository: ${errorMessage}`,
              );
            }
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
              githubRepoSetup,
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

  // Update UI state for a pod (terminal sessions, preferences, etc)
  updateUiState: protectedProcedure
    .input(
      z.object({
        podId: z.string(),
        uiState: z.record(z.string(), z.unknown()), // Generic JSON object for any UI state
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if user has access to this pod
      const [pod] = await ctx.db
        .select()
        .from(pods)
        .where(eq(pods.id, input.podId))
        .limit(1);

      if (!pod) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pod not found",
        });
      }

      // Check team membership
      const membership = await ctx.db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, pod.teamId),
            eq(teamMembers.userId, userId),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      // Update UI state
      await ctx.db
        .update(pods)
        .set({
          uiState: JSON.stringify(input.uiState),
          updatedAt: new Date(),
        })
        .where(eq(pods.id, input.podId));

      return { success: true };
    }),

  // Kill a tmux session in a pod
  killTerminalSession: protectedProcedure
    .input(
      z.object({
        podId: z.string(),
        sessionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if user has access to this pod
      const [pod] = await ctx.db
        .select()
        .from(pods)
        .where(eq(pods.id, input.podId))
        .limit(1);

      if (!pod) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pod not found",
        });
      }

      // Check team membership
      const membership = await ctx.db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, pod.teamId),
            eq(teamMembers.userId, userId),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      // Kill the tmux session in the container
      try {
        const { PodProvisioningService } = await import(
          "../../pod-orchestration/pod-provisioning-service"
        );

        if (!pod.serverId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Pod has no server assigned",
          });
        }

        const provisioningService = new PodProvisioningService();
        const serverConnection =
          await provisioningService.getServerConnectionDetails(pod.serverId);

        const { GVisorRuntime } = await import(
          "../../pod-orchestration/container-runtime"
        );
        const runtime = new GVisorRuntime(serverConnection);

        // Get the active container
        const container = await runtime.getActiveContainerForPodOrThrow(
          input.podId,
        );

        // Kill all processes in the tmux session aggressively
        // Strategy: Get all PIDs from tmux panes, then kill the entire process tree
        try {
          // Get all pane PIDs (the shell processes)
          const { stdout: pidList } = await runtime.execInContainer(
            input.podId,
            container.id,
            [
              "sh",
              "-c",
              `tmux list-panes -t "${input.sessionId}" -F '#{pane_pid}' 2>/dev/null || true`,
            ],
          );

          // For each PID, kill the entire process tree (children and descendants)
          if (pidList.trim()) {
            const pids = pidList.trim().split("\n");
            for (const pid of pids) {
              if (pid) {
                // Kill all descendants first (SIGKILL for immediate termination)
                await runtime.execInContainer(input.podId, container.id, [
                  "sh",
                  "-c",
                  `pkill -9 -P ${pid} 2>/dev/null || true`,
                ]);
                // Then kill the parent process
                await runtime.execInContainer(input.podId, container.id, [
                  "sh",
                  "-c",
                  `kill -9 ${pid} 2>/dev/null || true`,
                ]);
              }
            }
          }
        } catch (error) {
          // Ignore errors - session might not exist
          console.log(`[killTerminalSession] Error killing processes:`, error);
        }

        // Finally, kill the tmux session itself
        await runtime.execInContainer(input.podId, container.id, [
          "sh",
          "-c",
          `tmux kill-session -t "${input.sessionId}" 2>/dev/null || true`,
        ]);

        console.log(
          `[killTerminalSession] Killed tmux session ${input.sessionId} in pod ${input.podId}`,
        );

        return { success: true };
      } catch (error) {
        console.error(`[killTerminalSession] Failed to kill session:`, error);
        // Don't throw - session might already be dead, which is fine
        return { success: true };
      }
    }),

  /**
   * Update tabs for a pod
   * - Updates the config in the database
   * - Writes the updated pinacle.yaml to the container (if repo exists)
   */
  updateTabs: protectedProcedure
    .input(
      z.object({
        podId: z.string(),
        tabs: z.array(
          z.object({
            name: z.string(),
            service: z.string().optional(),
            url: z.string().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Get pod and check access
        const pod = await ctx.db.query.pods.findFirst({
          where: (pods, { eq, and }) =>
            and(
              eq(pods.id, input.podId),
              eq(pods.ownerId, ctx.session.user.id),
            ),
        });

        if (!pod) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pod not found",
          });
        }

        // Parse current config from database
        const { podRecordToPinacleConfig, pinacleConfigToJSON } = await import(
          "../../pod-orchestration/pinacle-config"
        );

        const currentConfig = podRecordToPinacleConfig({
          config: pod.config,
          name: pod.name,
        });

        // Update tabs in config
        const updatedConfig = {
          ...currentConfig,
          tabs: input.tabs.length > 0 ? input.tabs : undefined,
        };

        // Convert to JSON for DB storage (database stores PinacleConfig, not PodSpec)
        const configJSON = pinacleConfigToJSON(updatedConfig);

        // Update database
        await ctx.db
          .update(pods)
          .set({ config: configJSON })
          .where(eq(pods.id, input.podId));

        // Write to container if pod is running and has a repo
        if (pod.status === "running" && pod.githubRepo) {
          const provisioningService = new PodProvisioningService();
          const serverConnection =
            await provisioningService.getServerConnectionDetails(pod.serverId!);

          const { GVisorRuntime } = await import(
            "../../pod-orchestration/container-runtime"
          );
          const runtime = new GVisorRuntime(serverConnection);

          const container = await runtime.getActiveContainerForPodOrThrow(
            input.podId,
          );

          // Generate pinacle.yaml content
          const { serializePinacleConfig } = await import(
            "../../pod-orchestration/pinacle-config"
          );
          const yamlContent = serializePinacleConfig(updatedConfig);

          // Determine the workspace path
          const { getProjectFolderFromRepository } = await import(
            "../../utils"
          );
          const projectFolder = getProjectFolderFromRepository(pod.githubRepo);
          const workspacePath = projectFolder
            ? `/workspace/${projectFolder}`
            : "/workspace";

          // Write pinacle.yaml to container
          await runtime.execInContainer(input.podId, container.id, [
            "sh",
            "-c",
            `cat > ${workspacePath}/pinacle.yaml << 'EOF'\n${yamlContent}\nEOF`,
          ]);

          console.log(
            `[updateTabs] Updated pinacle.yaml in container for pod ${input.podId}`,
          );
        }

        console.log(`[updateTabs] Updated tabs for pod ${input.podId}`);

        return { success: true };
      } catch (error) {
        console.error(`[updateTabs] Failed to update tabs:`, error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to update tabs",
        });
      }
    }),

  /**
   * Get git status for a pod
   * - Runs git status --porcelain in the container
   * - Returns whether there are uncommitted/untracked files and the count
   */
  getGitStatus: protectedProcedure
    .input(
      z.object({
        podId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if user has access to this pod
      const pod = await ctx.db.query.pods.findFirst({
        where: and(eq(pods.id, input.podId), eq(pods.ownerId, userId)),
      });

      if (!pod) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pod not found" });
      }

      // Only check git status if pod is running and has a repo
      if (pod.status !== "running" || !pod.githubRepo || !pod.serverId) {
        return { hasChanges: false, changedFiles: 0 };
      }

      try {
        const { PodProvisioningService } = await import(
          "../../pod-orchestration/pod-provisioning-service"
        );

        const provisioningService = new PodProvisioningService();
        const serverConnection =
          await provisioningService.getServerConnectionDetails(pod.serverId);

        const { GVisorRuntime } = await import(
          "../../pod-orchestration/container-runtime"
        );
        const runtime = new GVisorRuntime(serverConnection);

        // Get the active container
        const container = await runtime.getActiveContainerForPodOrThrow(
          input.podId,
        );

        // Get the repo directory
        const repoName = pod.githubRepo.split("/")[1];
        const repoPath = `/workspace/${repoName}`;

        // Run git status --porcelain to get changed files
        // --porcelain gives machine-readable output, one line per changed file
        const result = await runtime.execInContainer(
          input.podId,
          container.id,
          [
            "sh",
            "-c",
            `cd ${repoPath} && git status --porcelain 2>/dev/null || echo ""`,
          ],
        );

        const output = result.stdout?.trim() || "";

        // Each line in porcelain output represents a changed/untracked file
        const lines = output
          .split("\n")
          .filter((line: string) => line.trim().length > 0);
        const changedFiles = lines.length;

        return {
          hasChanges: changedFiles > 0,
          changedFiles,
        };
      } catch (error) {
        console.error(`[getGitStatus] Failed to check git status:`, error);
        // Don't throw - just return no changes if we can't check
        return { hasChanges: false, changedFiles: 0 };
      }
    }),
});
