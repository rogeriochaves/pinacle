/**
 * Pod Provisioning Service
 *
 * Bridges the database layer and pod orchestration system.
 * This is what a background worker would call to actually provision pods.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { envSets, podLogs, pods, servers } from "../db/schema";
import { getNextAvailableServer } from "../servers";
import type { GitHubRepoSetup } from "./github-integration";
import {
  expandPinacleConfigToSpec,
  podRecordToPinacleConfig,
} from "./pinacle-config";
import { PodManager } from "./pod-manager";
import { SSHServerConnection } from "./server-connection";
import type { ServerConnection } from "./types";

export type ProvisionPodInput = {
  podId: string;
  serverId?: string; // If not provided, will auto-select a server
  githubRepoSetup?: GitHubRepoSetup; // SSH key pair and deploy key info for GitHub repos
};

export type DeprovisionPodInput = {
  podId: string;
};

export class PodProvisioningService {
  /**
   * Helper method to get server connection details
   * Abstracts away Lima VM detection and SSH port retrieval
   */
  async getServerConnectionDetails(
    serverId: string,
  ): Promise<ServerConnection> {
    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, serverId))
      .limit(1);

    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    if (!process.env.SSH_PRIVATE_KEY) {
      throw new Error("SSH_PRIVATE_KEY not found in environment");
    }

    // Get SSH port (dynamic for Lima VMs)
    let sshPort = server.sshPort;
    if (server.limaVmName) {
      const { getLimaSshPort } = await import("./lima-utils");
      sshPort = await getLimaSshPort(server.limaVmName);
      console.log(
        `[PodProvisioningService] Retrieved Lima SSH port for ${server.limaVmName}: ${sshPort}`,
      );
    }

    return new SSHServerConnection({
      host: server.sshHost,
      port: sshPort,
      user: server.sshUser,
      privateKey: process.env.SSH_PRIVATE_KEY,
    });
  }

  /**
   * Provisions a pod from the database onto a server
   */
  async provisionPod(
    input: ProvisionPodInput,
    cleanupOnError: boolean = true,
  ): Promise<void> {
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
      const availableServer = await getNextAvailableServer();

      if (!availableServer) {
        throw new Error("No available servers found");
      }

      serverId = availableServer.id;
    }

    // Get server connection details
    const serverConnection = await this.getServerConnectionDetails(serverId);

    console.log(
      `[PodProvisioningService] Provisioning pod ${podId} on server ${serverId}`,
    );

    let podManager: PodManager | null = null;
    try {
      // 3. Update pod status to "provisioning"
      await db
        .update(pods)
        .set({
          status: "provisioning",
          serverId: serverId,
          updatedAt: new Date(),
        })
        .where(eq(pods.id, podId));

      // 5. Create PodManager with server connection
      podManager = new PodManager(podId, serverConnection);

      // 6. Parse PinacleConfig from database and expand to PodSpec
      console.log(
        `[PodProvisioningService] Parsing pinacle config for pod ${podId}`,
      );

      const pinacleConfig = podRecordToPinacleConfig({
        config: podRecord.config,
        name: podRecord.name,
      });

      console.log(
        `[PodProvisioningService] Expanding config${pinacleConfig.template ? ` with template: ${pinacleConfig.template}` : ""}`,
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

      // Use the single source of truth expansion function
      const spec = await expandPinacleConfigToSpec(pinacleConfig, {
        id: podRecord.id,
        name: podRecord.name,
        slug: podRecord.slug,
        description: podRecord.description || undefined,
        environment,
        githubRepo: podRecord.githubRepo || undefined,
        githubBranch: podRecord.githubBranch || undefined,
        githubRepoSetup: githubRepoSetup,
      });

      console.log(
        "[PodProvisioningService] Provisioning pod with spec:",
        JSON.stringify(spec, null, 2),
      );

      // 7. Provision the pod
      // Attention: this will mutate the spec, adding for example the proxy port
      const podInstance = await podManager.createPod(spec);

      // 8. Convert PodSpec back to PinacleConfig to update database
      // This ensures database has the complete config including processes/install/tabs from template
      // Since PodSpec extends PinacleConfig, all fields including tabs are preserved automatically!
      const { podConfigToPinacleConfig, pinacleConfigToJSON } = await import(
        "./pinacle-config"
      );
      const completeConfig = podConfigToPinacleConfig(spec);
      const configJSON = pinacleConfigToJSON(completeConfig);

      // 9. Update pod in database with provisioning results and complete config
      await db
        .update(pods)
        .set({
          status: "running",
          containerId: podInstance.container?.id,
          internalIp: spec.network.podIp,
          publicUrl: `https://${podRecord.slug}.pinacle.dev`,
          ports: JSON.stringify(spec.network.ports),
          config: configJSON, // Update with complete config including processes/install
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

      // Clean up container if it exists (remove volumes on error)
      if (cleanupOnError) {
        const container = await podManager?.getPodContainer();
        if (container) {
          await podManager?.cleanupPodByContainerId(container.id, {
            removeVolumes: true,
          });
        }
      }

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
   * Deprovisions a pod - stops and removes container, cleans up network
   * This is the inverse of provisionPod
   */
  async deprovisionPod(input: DeprovisionPodInput): Promise<void> {
    const { podId } = input;

    console.log(`[PodProvisioningService] Deprovisioning pod ${podId}`);

    // 1. Get pod from database
    const [podRecord] = await db
      .select()
      .from(pods)
      .where(eq(pods.id, podId))
      .limit(1);

    if (!podRecord) {
      throw new Error(`Pod ${podId} not found in database`);
    }

    if (!podRecord.serverId) {
      console.log(
        `[PodProvisioningService] Pod ${podId} has no server assigned, nothing to clean up`,
      );
      return;
    }

    if (!podRecord.containerId) {
      console.log(
        `[PodProvisioningService] Pod ${podId} has no container, nothing to clean up`,
      );
      return;
    }

    try {
      // 2. Get server connection details
      const serverConnection = await this.getServerConnectionDetails(
        podRecord.serverId,
      );

      // 3. Create PodManager and clean up container
      const podManager = new PodManager(podId, serverConnection);

      console.log(
        `[PodProvisioningService] Cleaning up container ${podRecord.containerId} for pod ${podId} (removing volumes)`,
      );

      // Deprovision = permanent deletion, so remove volumes
      await podManager.cleanupPodByContainerId(podRecord.containerId, {
        removeVolumes: true,
      });

      console.log(
        `[PodProvisioningService] Successfully deprovisioned pod ${podId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[PodProvisioningService] Failed to deprovision pod ${podId}:`,
        errorMessage,
      );
      throw error;
    }
  }

  async cleanupPod(input: { podId: string; serverId: string }): Promise<void> {
    const { podId, serverId } = input;

    const serverConnection = await this.getServerConnectionDetails(serverId);
    const podManager = new PodManager(podId, serverConnection);

    await podManager.cleanupPod();
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
