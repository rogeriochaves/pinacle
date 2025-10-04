import { exec } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { db } from "../db";
import { podLogs } from "../db/schema";
import { generateKSUID } from "../utils";
import type { ServerConnection, ServerConnectionConfig } from "./types";

const execAsync = promisify(exec);

export class SSHServerConnection implements ServerConnection {
  private config: ServerConnectionConfig;
  private keyFilePath: string | null = null;
  private podId: string | null = null;

  constructor(config: ServerConnectionConfig, podId?: string) {
    this.config = config;
    this.podId = podId || null;
  }

  setPodId(podId: string): void {
    this.podId = podId;
  }

  async exec(
    command: string,
    options: { sudo?: boolean; label?: string; containerCommand?: string } = {},
  ): Promise<{ stdout: string; stderr: string }> {
    // Write private key to temporary file for SSH
    const keyPath = await this.getKeyFilePath();

    const sudoPrefix = options.sudo ? "sudo " : "";
    const fullCommand = `${sudoPrefix}${command}`;

    // Build SSH command - wrap the command in single quotes to preserve it exactly
    // Escape any single quotes in the command by replacing ' with '\''
    const escapedCommand = fullCommand.replace(/'/g, "'\\''");
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

    const startTime = Date.now();
    let exitCode = 0;

    try {
      const result = await execAsync(sshCommand);

      // Log command execution if podId is set
      if (this.podId) {
        await this.logCommand({
          command: fullCommand,
          containerCommand: options.containerCommand,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode,
          duration: Date.now() - startTime,
          label: options.label,
        });
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stderr = error && typeof error === 'object' && 'stderr' in error ? String((error as any).stderr) : message;
      const stdout = error && typeof error === 'object' && 'stdout' in error ? String((error as any).stdout) : '';
      exitCode = error && typeof error === 'object' && 'code' in error ? Number((error as any).code) : 1;

      // Log failed command execution if podId is set
      if (this.podId) {
        await this.logCommand({
          command: fullCommand,
          containerCommand: options.containerCommand,
          stdout,
          stderr,
          exitCode,
          duration: Date.now() - startTime,
          label: options.label,
        });
      }

      console.error(`[ServerConnection] SSH command failed: ${message}`);
      throw error;
    }
  }

  private async logCommand(params: {
    command: string;
    containerCommand?: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
    label?: string;
  }): Promise<void> {
    if (!this.podId) return;

    const { command, containerCommand, stdout, stderr, exitCode, duration, label } = params;

    try {
      await db.insert(podLogs).values({
        id: generateKSUID("pod_log"),
        podId: this.podId,
        command,
        containerCommand: containerCommand || null,
        stdout: stdout || "",
        stderr: stderr || "",
        exitCode,
        duration,
        label: label || null,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error(`[ServerConnection] Failed to log command for pod ${this.podId}:`, error);
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

    await writeFile(tempKeyPath, this.config.privateKey, {
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
