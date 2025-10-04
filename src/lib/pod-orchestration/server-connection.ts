import { exec } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ServerConnection, ServerConnectionConfig } from "./types";

const execAsync = promisify(exec);

export class SSHServerConnection implements ServerConnection {
  private config: ServerConnectionConfig;
  private keyFilePath: string | null = null;

  constructor(config: ServerConnectionConfig) {
    this.config = config;
  }

  async exec(
    command: string,
    options: { sudo?: boolean } = {},
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

    try {
      const result = await execAsync(sshCommand);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ServerConnection] SSH command failed: ${message}`);
      throw error;
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
