
import { getProjectFolderFromRepository } from "../utils";
import { KataRuntime } from "./container-runtime";
import type { PodSpec, ProcessConfig, ServerConnection } from "./types";

/**
 * ProcessProvisioner handles installation and lifecycle of user-defined processes
 * Processes run in tmux sessions (not OpenRC services like built-in services)
 */
export class ProcessProvisioner {
  private podId: string;
  private containerRuntime: KataRuntime;

  constructor(podId: string, serverConnection: ServerConnection) {
    this.podId = podId;
    this.containerRuntime = new KataRuntime(serverConnection);
  }

  /**
   * Run install command (e.g., pnpm install, uv sync)
   * For existing repos, failures are non-blocking (log and continue)
   * For new repos, failures fail provisioning
   */
  async runInstall(spec: PodSpec, isExistingRepo: boolean): Promise<void> {
    if (!spec.installCommand) {
      console.log(
        `[ProcessProvisioner] No install command specified for pod ${this.podId}`,
      );
      return;
    }

    const container =
      await this.containerRuntime.getActiveContainerForPodOrThrow(this.podId);

    try {
      console.log(
        `[ProcessProvisioner] Running install command for pod ${this.podId}`,
      );

      const installCmd = this.commandToShellString(spec.installCommand);
      const workDir = this.getWorkDir(spec);

      // Run install command in working directory
      await this.containerRuntime.execInContainer(this.podId, container.id, [
        "sh",
        "-c",
        `cd ${workDir} && ${installCmd}`,
      ]);

      console.log(
        `[ProcessProvisioner] Successfully completed install for pod ${this.podId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ProcessProvisioner] Install command failed for pod ${this.podId}: ${message}`,
      );

      if (isExistingRepo) {
        console.log(
          `[ProcessProvisioner] Existing repo install failed - continuing anyway`,
        );
      } else {
        throw new Error(`Install command failed: ${message}`);
      }
    }
  }

  /**
   * Provision a process (create tmux session)
   * This creates a detached tmux session that runs the process
   */
  async provisionProcess(
    spec: PodSpec,
    process: ProcessConfig,
    isExistingRepo: boolean,
  ): Promise<void> {
    const container =
      await this.containerRuntime.getActiveContainerForPodOrThrow(this.podId);

    try {
      console.log(
        `[ProcessProvisioner] Provisioning process ${process.name} for pod ${this.podId}`,
      );

      const sessionName =
        process.tmuxSession || `process-${this.podId}-${process.name}`;
      const startCmd = this.commandToShellString(process.startCommand);
      const workDir = this.getWorkDir(spec);

      // Create detached tmux session running the process
      // -d: detached
      // -s: session name
      const tmuxCmd = `tmux new -d -s "${sessionName}" "cd ${workDir} && ${startCmd}"`;

      await this.containerRuntime.execInContainer(this.podId, container.id, [
        "sh",
        "-c",
        tmuxCmd,
      ]);

      console.log(
        `[ProcessProvisioner] Successfully provisioned process ${process.name} in tmux session ${sessionName}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ProcessProvisioner] Failed to provision process ${process.name}: ${message}`,
      );

      if (isExistingRepo) {
        console.log(
          `[ProcessProvisioner] Existing repo process failed - continuing anyway`,
        );
      } else {
        throw new Error(
          `Failed to provision process ${process.name}: ${message}`,
        );
      }
    }
  }

  /**
   * Start a process (create or recreate tmux session with the command)
   * This is called on pod start/restart to ensure the process is actually running
   */
  async startProcess(spec: PodSpec, process: ProcessConfig): Promise<void> {
    const container =
      await this.containerRuntime.getActiveContainerForPodOrThrow(this.podId);

    try {
      console.log(
        `[ProcessProvisioner] Starting process ${process.name} for pod ${this.podId}`,
      );

      const sessionName =
        process.tmuxSession || `process-${this.podId}-${process.name}`;
      const startCmd = this.commandToShellString(process.startCommand);
      const workDir = this.getWorkDir(spec);

      // Kill existing session if it exists (it might be empty from persisted volumes)
      // Then create a new session with the command
      const tmuxCmd = `tmux kill-session -t "${sessionName}" 2>/dev/null || true; tmux new -d -s "${sessionName}" "cd ${workDir} && ${startCmd}"`;
      console.log('tmuxCmd', tmuxCmd);

      await this.containerRuntime.execInContainer(this.podId, container.id, [
        "sh",
        "-c",
        tmuxCmd,
      ]);

      console.log(
        `[ProcessProvisioner] Successfully started process ${process.name} in tmux session ${sessionName}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ProcessProvisioner] Failed to start process ${process.name}: ${message}`,
      );
      throw new Error(`Failed to start process ${process.name}: ${message}`);
    }
  }

  /**
   * Check if a process is healthy
   * For new repos, run health check
   * For existing repos, skip health check (non-blocking)
   */
  async checkProcessHealth(
    spec: PodSpec,
    process: ProcessConfig,
    isExistingRepo: boolean,
    timeout = 30000,
  ): Promise<boolean> {
    if (!process.healthCheck) {
      console.log(
        `[ProcessProvisioner] No health check configured for process ${process.name}`,
      );
      return true;
    }

    if (isExistingRepo) {
      console.log(
        `[ProcessProvisioner] Skipping health check for existing repo process ${process.name}`,
      );
      return true;
    }

    const container =
      await this.containerRuntime.getActiveContainerForPodOrThrow(this.podId);

    const healthCmd = this.commandToShellString(process.healthCheck);
    const workDir = this.getWorkDir(spec);

    const startTime = Date.now();
    let retries = 0;

    while (true) {
      try {
        await this.containerRuntime.execInContainer(this.podId, container.id, [
          "sh",
          "-c",
          `cd ${workDir} && ${healthCmd}`,
        ]);
        console.log(
          `[ProcessProvisioner] Health check passed for process ${process.name}`,
        );
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (Date.now() - startTime > timeout) {
          console.log(
            `[ProcessProvisioner] Health check timed out for ${process.name}: ${message}`,
          );
          return false;
        }

        retries++;
        console.log(
          `[ProcessProvisioner] Health check failed for ${process.name}: ${message} (retry #${retries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  /**
   * Stop a process (kill tmux session)
   */
  async stopProcess(process: ProcessConfig): Promise<void> {
    const container =
      await this.containerRuntime.getActiveContainerForPodOrThrow(this.podId);

    try {
      const sessionName =
        process.tmuxSession || `process-${this.podId}-${process.name}`;

      console.log(
        `[ProcessProvisioner] Stopping process ${process.name} (tmux session ${sessionName})`,
      );

      await this.containerRuntime.execInContainer(this.podId, container.id, [
        "sh",
        "-c",
        `tmux kill-session -t "${sessionName}" 2>/dev/null || true`,
      ]);

      console.log(
        `[ProcessProvisioner] Successfully stopped process ${process.name}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ProcessProvisioner] Failed to stop process ${process.name}: ${message}`,
      );
      // Don't throw - stopping is best-effort
    }
  }

  /**
   * List all tmux sessions (for debugging)
   */
  async listTmuxSessions(): Promise<string[]> {
    const container =
      await this.containerRuntime.getActiveContainerForPodOrThrow(this.podId);

    try {
      const { stdout } = await this.containerRuntime.execInContainer(
        this.podId,
        container.id,
        [
          "sh",
          "-c",
          "tmux list-sessions -F '#{session_name}' 2>/dev/null || true",
        ],
      );

      return stdout
        .trim()
        .split("\n")
        .filter((s) => s.length > 0);
    } catch (error) {
      console.error(
        `[ProcessProvisioner] Failed to list tmux sessions: ${error}`,
      );
      return [];
    }
  }

  /**
   * Get working directory for commands
   */
  private getWorkDir(spec: PodSpec): string {
    const projectFolder = spec.githubRepo
      ? getProjectFolderFromRepository(spec.githubRepo)
      : null;
    return projectFolder ? `/workspace/${projectFolder}` : "/workspace";
  }

  /**
   * Convert command (string | string[]) to shell string
   */
  private commandToShellString(command: string | string[]): string {
    if (typeof command === "string") {
      return command;
    }
    // Array of commands - join with &&
    return command.join(" && ");
  }
}
