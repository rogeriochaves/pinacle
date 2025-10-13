import { exec } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../../env";
import { SSHServerConnection } from "./server-connection";
import type { ServerConnection } from "./types";

const execAsync = promisify(exec);

export const getLimaServerConnection = async (
  vmName: string = "gvisor-alpine",
): Promise<ServerConnection> => {
  if (!env.SSH_PRIVATE_KEY) {
    throw new Error("SSH_PRIVATE_KEY not found in environment");
  }

  const sshPort = await getLimaSshPort(vmName);
  return new SSHServerConnection({
    host: "127.0.0.1",
    port: sshPort,
    user: process.env.USER || "root",
    privateKey: env.SSH_PRIVATE_KEY,
  });
};

/**
 * Get the current SSH port for a Lima VM.
 * Lima VMs use dynamic SSH ports that change on each start.
 *
 * @param vmName - The name of the Lima VM (e.g., "gvisor-alpine")
 * @returns The SSH port number
 * @throws Error if the VM is not running or port cannot be determined
 */
export const getLimaSshPort = async (vmName: string): Promise<number> => {
  try {
    // Use limactl show-ssh to get the SSH command with port
    const { stdout } = await execAsync(
      `limactl show-ssh ${vmName} 2>/dev/null`,
    );

    // Parse SSH command output like "... -o Port=49856 ..."
    const portMatch = stdout.match(/Port=(\d+)/);

    if (!portMatch) {
      throw new Error(
        `Failed to parse SSH port from limactl output for VM: ${vmName}`,
      );
    }

    const port = Number.parseInt(portMatch[1], 10);

    if (Number.isNaN(port) || port <= 0) {
      throw new Error(`Invalid SSH port parsed for VM ${vmName}: ${port}`);
    }

    return port;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get Lima SSH port for VM ${vmName}: ${message}`);
  }
};

/**
 * Check if a Lima VM is running
 *
 * @param vmName - The name of the Lima VM
 * @returns true if the VM is running, false otherwise
 */
export const isLimaVmRunning = async (vmName: string): Promise<boolean> => {
  try {
    const { stdout } = await execAsync("limactl list --format json");
    const vms = stdout
      .trim()
      .split("\n")
      .filter((line) => line.trim())
      .map((json) => JSON.parse(json));

    const vm = vms.find((v) => v.name === vmName);
    return vm?.status === "Running";
  } catch {
    return false;
  }
};
