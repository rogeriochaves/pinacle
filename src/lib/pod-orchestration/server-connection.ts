import { exec } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { podLogs } from "../db/schema";
import type {
  ContainerCommand,
  ServerConnection,
  ServerConnectionConfig,
} from "./types";

type OutputBuffer = {
  stdout: string;
  stderr: string;
  lastFlush: number;
  flushTimer: NodeJS.Timeout | null;
};

export class SSHServerConnection implements ServerConnection {
  private config: ServerConnectionConfig;
  private keyFilePath: string | null = null;
  // Debounce configuration for log updates (ms)
  private readonly LOG_FLUSH_INTERVAL = 500;

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

    return new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        // Use non-promisified exec to get access to streams
        const childProcess = exec(sshCommand, {
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        });

        // Initialize output buffer for debounced updates
        const outputBuffer: OutputBuffer = {
          stdout: "",
          stderr: "",
          lastFlush: Date.now(),
          flushTimer: null,
        };

        // Set up streaming update function with debouncing
        const scheduleFlush = () => {
          if (outputBuffer.flushTimer) {
            return; // Flush already scheduled
          }

          outputBuffer.flushTimer = setTimeout(() => {
            this.flushOutputBuffer(podId, logId, outputBuffer);
            outputBuffer.flushTimer = null;
          }, this.LOG_FLUSH_INTERVAL);
        };

        // Stream stdout
        if (childProcess.stdout) {
          childProcess.stdout.on("data", (data: Buffer) => {
            const chunk = data.toString();
            outputBuffer.stdout += chunk;
            scheduleFlush();
          });
        }

        // Stream stderr
        if (childProcess.stderr) {
          childProcess.stderr.on("data", (data: Buffer) => {
            const chunk = data.toString();
            outputBuffer.stderr += chunk;
            scheduleFlush();
          });
        }

        // Handle process completion
        childProcess.on("exit", (code) => {
          const exitCode = code ?? 0;

          // Clear any pending flush timer
          if (outputBuffer.flushTimer) {
            clearTimeout(outputBuffer.flushTimer);
            outputBuffer.flushTimer = null;
          }

          // Final flush with exit code and duration
          if (podId && logId) {
            this.updateCommandLog(podId, logId, {
              stdout: outputBuffer.stdout,
              stderr: outputBuffer.stderr,
              exitCode,
              duration: Date.now() - startTime,
            }).catch((error) => {
              console.error(
                `[ServerConnection] Failed to write final log update: ${error}`,
              );
            });
          }

          if (exitCode === 0) {
            resolve({
              stdout: outputBuffer.stdout,
              stderr: outputBuffer.stderr,
            });
          } else {
            console.error(
              `[ServerConnection] SSH command failed (exit code ${exitCode}): >${fullCommand}\n ${outputBuffer.stdout} ${outputBuffer.stderr}`,
            );
            // Create error with stderr as message (to match promisify(exec) behavior)
            // This ensures error.message contains the actual command output for error checking
            const errorMessage = outputBuffer.stderr || outputBuffer.stdout || `Command failed with exit code ${exitCode}`;
            const error: Error & { code?: number; stdout?: string; stderr?: string } =
              new Error(errorMessage);
            error.code = exitCode;
            error.stdout = outputBuffer.stdout;
            error.stderr = outputBuffer.stderr;
            reject(error);
          }
        });

        // Handle errors
        childProcess.on("error", (error) => {
          // Clear any pending flush timer
          if (outputBuffer.flushTimer) {
            clearTimeout(outputBuffer.flushTimer);
            outputBuffer.flushTimer = null;
          }

          // Final flush with error state
          if (podId && logId) {
            this.updateCommandLog(podId, logId, {
              stdout: outputBuffer.stdout,
              stderr: outputBuffer.stderr || error.message,
              exitCode: 1,
              duration: Date.now() - startTime,
            }).catch((flushError) => {
              console.error(
                `[ServerConnection] Failed to write error log update: ${flushError}`,
              );
            });
          }

          console.error(
            `[ServerConnection] SSH command error: >${fullCommand}\n`,
            error,
          );
          reject(error);
        });
      },
    );
  }

  /**
   * Flush output buffer to database (for streaming updates during command execution)
   * This is called periodically via debouncing and does NOT set exitCode/duration
   */
  private async flushOutputBuffer(
    podId: string | undefined,
    logId: string | null,
    buffer: OutputBuffer,
  ): Promise<void> {
    if (!podId || !logId) return;

    try {
      await db
        .update(podLogs)
        .set({
          stdout: buffer.stdout || "",
          stderr: buffer.stderr || "",
          // Don't set exitCode or duration - command is still running
        })
        .where(eq(podLogs.id, logId));

      buffer.lastFlush = Date.now();
    } catch (error) {
      console.error(
        `[ServerConnection] Failed to flush output buffer for log ${logId}:`,
        error,
      );
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
    return (
      command
        // Redact SSH private keys
        .replaceAll(
          /(-----BEGIN OPENSSH PRIVATE KEY-----)[\s\S]*(-----END OPENSSH PRIVATE KEY-----)/g,
          "$1 [redacted] $2",
        )
        // Redact .env file content (may contain API keys, passwords, etc.)
        .replaceAll(
          /(DOTENV_EOF\n)[\s\S]*(DOTENV_EOF)/g,
          "$1[env content redacted]\n$2",
        )
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
