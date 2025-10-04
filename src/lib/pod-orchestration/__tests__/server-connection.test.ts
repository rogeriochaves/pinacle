import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/env";
import { SSHServerConnection } from "../server-connection";

describe("ServerConnection", () => {
  let connection: SSHServerConnection;

  beforeAll(() => {
    // Create connection to Lima VM using SSH credentials from .env.local
    if (!env.SSH_PRIVATE_KEY) {
      throw new Error("SSH_PRIVATE_KEY not found in environment");
    }

    connection = new SSHServerConnection({
      host: "127.0.0.1",
      port: 52111, // Lima default SSH port
      user: process.env.USER || "rchaves",
      privateKey: env.SSH_PRIVATE_KEY,
    });
  });

  afterAll(async () => {
    // Cleanup temporary key file
    await connection.cleanup();
  });

  it("should test SSH connection successfully", async () => {
    const isConnected = await connection.testConnection();
    expect(isConnected).toBe(true);
  }, 10000);

  it("should execute simple command", async () => {
    const result = await connection.exec("echo 'hello from server'");
    expect(result.stdout.trim()).toBe("hello from server");
  }, 10000);

  it("should execute command with sudo", async () => {
    const result = await connection.exec("whoami", { sudo: true });
    expect(result.stdout.trim()).toBe("root");
  }, 10000);

  it("should get hostname", async () => {
    const result = await connection.exec("hostname");
    expect(result.stdout.trim()).toBe("lima-gvisor-alpine");
  }, 10000);

  it("should execute docker command", async () => {
    const result = await connection.exec("docker --version", { sudo: true });
    expect(result.stdout).toContain("Docker version");
  }, 10000);
});
