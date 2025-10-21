import { exec } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { podLogs } from "../db/schema";
import type {
  ContainerCommand,
  ServerConnection,
  ServerConnectionConfig,
} from "./types";

const execAsync = promisify(exec);

export class SSHServerConnection implements ServerConnection {
  private config: ServerConnectionConfig;
  private keyFilePath: string | null = null;

  constructor(config: ServerConnectionConfig) {
    this.config = config;
  }

  async exec(
    command: string,
    options: {
      sudo?: boolean;
      label?: string;
      containerCommand?: ContainerCommand;
    } = {},
  ): Promise<{ stdout: string; stderr: string }> {
    // Write private key to temporary file for SSH
    const keyPath = await this.getKeyFilePath();

    const sudoPrefix = options.sudo ? "sudo " : "";
    const fullCommand = `${sudoPrefix}${command}`;

    // Build SSH command - wrap the command in single quotes to preserve it exactly
    // Escape any single quotes in the command by replacing ' with '\''
    const escapedCommand = fullCommand.replace(/'/g, "'\\''");
    if (!this.config.port) {
      throw new Error("Port is not defined for server connection");
    }
    const sshCommand = [
      "ssh",
      "-i",
      keyPath,
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "LogLevel=ERROR",
      "-p",
      this.config.port.toString(),
      `${this.config.user}@${this.config.host}`,
      `'${escapedCommand}'`,
    ].join(" ");

    // Create log entry BEFORE execution starts
    const podId = options.containerCommand?.podId;
    const logId = podId
      ? await this.createCommandLog({
          podId,
          command: fullCommand,
          containerCommand: options.containerCommand?.command,
          label: options.label,
        })
      : null;

    const startTime = Date.now();
    let exitCode = 0;

    try {
      const result = await execAsync(sshCommand);

      // Update log with successful execution results
      if (podId && logId) {
        await this.updateCommandLog(podId, logId, {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode,
          duration: Date.now() - startTime,
        });
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stderr =
        error && typeof error === "object" && "stderr" in error
          ? // biome-ignore lint/suspicious/noExplicitAny: meh
            String((error as any).stderr)
          : message;
      const stdout =
        error && typeof error === "object" && "stdout" in error
          ? // biome-ignore lint/suspicious/noExplicitAny: meh
            String((error as any).stdout)
          : "";
      exitCode =
        error && typeof error === "object" && "code" in error
          ? // biome-ignore lint/suspicious/noExplicitAny: meh
            Number((error as any).code)
          : 1;

      // Update log with failed execution results
      if (podId && logId) {
        await this.updateCommandLog(podId, logId, {
          stdout,
          stderr,
          exitCode,
          duration: Date.now() - startTime,
        });
      }

      console.error(
        `[ServerConnection] SSH command failed (exit code ${exitCode}): >${fullCommand}\n ${stdout} ${stderr}`,
      );
      throw error;
    }
  }

  /**
   * Create a log entry before command execution starts
   * Returns the log ID so it can be updated later
   */
  private async createCommandLog(params: {
    podId: string;
    command: string;
    containerCommand?: string;
    label?: string;
  }): Promise<string | null> {
    if (!params.podId) return null;

    const { command, containerCommand, label } = params;

    try {
      const [inserted] = await db
        .insert(podLogs)
        .values({
          podId: params.podId,
          command: this.maskSensitive(command),
          containerCommand: containerCommand
            ? this.maskSensitive(containerCommand)
            : null,
          stdout: "", // Will be updated after execution
          stderr: "", // Will be updated after execution
          exitCode: null, // Will be updated after execution
          duration: null, // Will be updated after execution
          label: label || null,
          timestamp: new Date(),
        })
        .returning({ id: podLogs.id });
      return inserted?.id || null;
    } catch (error) {
      console.error(
        `[ServerConnection] Failed to create command log for pod ${params.podId}:`,
        error,
      );
      return null;
    }
  }

  private maskSensitive(command: string): string {
    return command.replaceAll(
      /(-----BEGIN OPENSSH PRIVATE KEY-----)[\s\S]*(-----END OPENSSH PRIVATE KEY-----)/g,
      "$1 [redacted] $2",
    );
  }

  /**
   * Update a command log entry with execution results
   */
  private async updateCommandLog(
    podId: string,
    logId: string,
    params: {
      stdout: string;
      stderr: string;
      exitCode: number;
      duration: number;
    },
  ): Promise<void> {
    if (!podId || !logId) return;

    const { stdout, stderr, exitCode, duration } = params;

    try {
      await db
        .update(podLogs)
        .set({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode,
          duration,
        })
        .where(eq(podLogs.id, logId));
    } catch (error) {
      console.error(
        `[ServerConnection] Failed to update command log ${logId} for pod ${podId}:`,
        error,
      );
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.exec("echo 'connection_test'");
      return result.stdout.includes("connection_test");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ServerConnection] Connection test failed: ${message}`);
      return false;
    }
  }

  private async getKeyFilePath(): Promise<string> {
    if (this.keyFilePath) {
      return this.keyFilePath;
    }

    // Create temporary key file
    const tempKeyPath = join(
      tmpdir(),
      `pinacle-ssh-key-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    );

    await writeFile(tempKeyPath, `${this.config.privateKey}\n`, {
      mode: 0o600,
    });

    this.keyFilePath = tempKeyPath;
    return tempKeyPath;
  }

  async cleanup(): Promise<void> {
    if (this.keyFilePath) {
      try {
        await unlink(this.keyFilePath);
        this.keyFilePath = null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[ServerConnection] Failed to cleanup key file: ${message}`,
        );
      }
    }
  }
}

/**
 * Factory function to create a ServerConnection from database server record
 */
export const createServerConnection = (serverInfo: {
  sshHost: string;
  sshPort: number;
  sshUser: string;
  privateKey: string;
}): ServerConnection => {
  return new SSHServerConnection({
    host: serverInfo.sshHost,
    port: serverInfo.sshPort,
    user: serverInfo.sshUser,
    privateKey: serverInfo.privateKey,
  });
};
