/**
 * Pod Provisioning Service
 *
 * Bridges the database layer and pod orchestration system.
 * This is what a background worker would call to actually provision pods.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { envSets, podLogs, pods, servers } from "../db/schema";
import { DefaultConfigResolver } from "./config-resolver";
import type { GitHubRepoSetup } from "./github-integration";
import {
  getResourcesFromTier,
  getTierFromConfig,
  podRecordToPinacleConfig,
} from "./pinacle-config";
import { DefaultPodManager } from "./pod-manager";
import { SSHServerConnection } from "./server-connection";
import type { ServerConnection } from "./types";

export type ProvisionPodInput = {
  podId: string;
  serverId?: string; // If not provided, will auto-select a server
  githubRepoSetup?: GitHubRepoSetup; // SSH key pair and deploy key info for GitHub repos
};

export class PodProvisioningService {
  private configResolver: DefaultConfigResolver;

  constructor() {
    this.configResolver = new DefaultConfigResolver();
  }

  /**
   * Provisions a pod from the database onto a server
   */
  async provisionPod(input: ProvisionPodInput): Promise<void> {
    const { podId, githubRepoSetup } = input;

    // 1. Get pod from database
    const [podRecord] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, podId))
      .limit(1);

    if (!podRecord) {
      throw new Error(`Pod ${podId} not found in database`);
    }

    // 2. Select server (if not already assigned)
    let serverId = podRecord.serverId || input.serverId;
    if (!serverId) {
      // Auto-select a server with capacity
      const [availableServer] = await db
        .select()
        .from(servers)
        .where(eq(servers.status, "online"))
        .limit(1);

      if (!availableServer) {
        throw new Error("No available servers found");
      }

      serverId = availableServer.id;
    }

    // Get server details
    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);

    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    console.log(
      `[PodProvisioningService] Provisioning pod ${podId} on server ${server.hostname}`,
    );

    try {
      // 3. Update pod status to "provisioning"
      await db
        .update(pods)
        .set({
          status: "provisioning",
          serverId: server.id,
          updatedAt: new Date(),
        })
        .where(eq(pods.id, podId));

      // 4. Get SSH port (dynamic for Lima VMs)
      let sshPort = server.sshPort;
      if (server.limaVmName) {
        // For Lima VMs, dynamically retrieve the current SSH port
        const { getLimaSshPort } = await import("./lima-utils");
        sshPort = await getLimaSshPort(server.limaVmName);
        console.log(
          `[PodProvisioningService] Retrieved Lima SSH port for ${server.limaVmName}: ${sshPort}`,
        );
      }

      // 5. Create SSH connection to server
      const serverConnection: ServerConnection = new SSHServerConnection({
        host: server.sshHost,
        port: sshPort,
        user: server.sshUser,
        privateKey: process.env.SSH_PRIVATE_KEY!,
      });

      // Set podId for logging
      serverConnection.setPodId(podId);

      // 6. Create PodManager with Lima config
      // The PodManager will create its own components internally
      // but they won't use the serverConnection we created above yet
      // TODO: Pass serverConnection to PodManager constructor
      const limaConfig = {
        vmName: server.limaVmName || server.hostname,
        sshPort,
      };
      const podManager = new DefaultPodManager(limaConfig);

      // 7. Parse PinacleConfig from database and derive resources
      console.log(
        `[PodProvisioningService] Parsing pinacle config for pod ${podId}`,
      );

      const pinacleConfig = podRecordToPinacleConfig({
        config: podRecord.config,
        name: podRecord.name,
      });

      const tierId = getTierFromConfig(pinacleConfig);
      const resources = getResourcesFromTier(tierId);

      console.log(
        `[PodProvisioningService] Building config${pinacleConfig.template ? ` with template: ${pinacleConfig.template}` : ""}`,
      );

      // Load environment variables from env set if attached
      let environment: Record<string, string> = {};
      if (podRecord.envSetId) {
        const [envSet] = await db
          .select()
          .from(envSets)
          .where(eq(envSets.id, podRecord.envSetId))
          .limit(1);

        if (envSet) {
          environment = JSON.parse(envSet.variables);
          console.log(
            `[PodProvisioningService] Loaded ${Object.keys(environment).length} env vars from env set: ${envSet.name}`,
          );
        }
      }

      const config = await this.configResolver.loadConfig(
        pinacleConfig.template || undefined,
        {
          id: podRecord.id,
          name: podRecord.name,
          slug: podRecord.slug,
          resources: {
            tier: tierId,
            cpuCores: resources.cpuCores,
            memoryMb: resources.memoryMb,
            storageMb: resources.storageMb,
          },
          network: {
            ports: podRecord.ports ? JSON.parse(podRecord.ports) : [],
          },
          environment,
          githubRepo: podRecord.githubRepo || undefined,
          githubBranch: podRecord.githubBranch || undefined,
          githubRepoSetup: githubRepoSetup, // Pass through the SSH key pair if provided
        },
      );

      console.log(`   Base image: ${config.baseImage}`);
      console.log(
        `   Services: ${config.services.map((s) => s.name).join(", ")}`,
      );

      // 7. Provision the pod
      const podInstance = await podManager.createPod(config);

      // 8. Update pod in database with provisioning results
      await db
        .update(pods)
        .set({
          status: "running",
          containerId: podInstance.container?.id,
          internalIp: config.network.podIp,
          publicUrl: `https://${podRecord.slug}.pinacle.dev`,
          ports: JSON.stringify(config.network.ports),
          lastStartedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pods.id, podId));

      console.log(
        `[PodProvisioningService] Successfully provisioned pod ${podId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[PodProvisioningService] Failed to provision pod ${podId}:`,
        errorMessage,
      );

      // Update pod status to error
      await db
        .update(pods)
        .set({
          status: "error",
          updatedAt: new Date(),
        })
        .where(eq(pods.id, podId));

      throw error;
    }
  }

  /**
   * Gets pod logs from database
   */
  async getPodLogs(podId: string): Promise<(typeof podLogs.$inferSelect)[]> {
    return db
      .select()
      .from(podLogs)
      .where(eq(podLogs.podId, podId))
      .orderBy(podLogs.timestamp);
  }
}
