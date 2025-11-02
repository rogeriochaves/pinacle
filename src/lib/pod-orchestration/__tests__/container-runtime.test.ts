import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GVisorRuntime } from "../container-runtime";
import { getLimaServerConnection } from "../lima-utils";
import type { PodSpec, } from "../types";

// Use vi.hoisted to ensure mockExec is available in the mock factory
const { mockExec } = vi.hoisted(() => ({
  mockExec: vi.fn(),
}));

vi.mock("child_process", () => ({
  exec: mockExec,
}));

vi.mock("util", () => ({
  promisify: (fn: any) => {
    return (...args: any[]) => {
      return new Promise((resolve, reject) => {
        fn(...args, (error: Error | null, result: any) => {
          if (error) reject(error);
          else resolve(result);
        });
      });
    };
  },
}));

describe("LimaGVisorRuntime", () => {
  let runtime: GVisorRuntime;
  let testConfig: PodSpec;

  beforeAll(async () => {
    // Mock Lima SSH port lookup - must match "Port=NUMBER" pattern
    mockExec.mockImplementation(
      (cmd: string, callback: (error: Error | null, result?: any) => void) => {
        if (cmd.includes("limactl show-ssh")) {
          callback(null, {
            stdout: "ssh -o Port=49464 root@localhost\n",
            stderr: "",
          });
        } else {
          callback(null, { stdout: "", stderr: "" });
        }
      },
    );

    runtime = new GVisorRuntime(await getLimaServerConnection());

    testConfig = {
      version: "1.0",
      tier: "dev.small",
      services: [],
      id: "test-pod-123",
      name: "Test Pod",
      slug: "test-pod",
      baseImage: "ubuntu:22.04",
      network: {
        ports: [
          { name: "app", internal: 3000, external: 30000, protocol: "tcp" },
          { name: "api", internal: 8000, external: 30001, protocol: "tcp" },
        ],
      },
      environment: {
        NODE_ENV: "development",
        PORT: "3000",
      },
      workingDir: "/workspace",
      user: "root",
      githubBranch: "main",
    };
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  describe("createContainer", () => {
    it("should create a container with gVisor runtime", async () => {
      const mockContainerId = "container-123";
      const mockContainerData = {
        Id: mockContainerId,
        Name: "/pinacle-pod-test-pod-123",
        State: {
          Status: "created",
          StartedAt: null,
          FinishedAt: "0001-01-01T00:00:00Z",
        },
        Created: "2023-01-01T00:00:00Z",
        NetworkSettings: { IPAddress: "172.17.0.2", Ports: {} },
      };

      // Mock docker create command
      mockExec.mockImplementationOnce((cmd: string, callback: any) => {
        expect(cmd).toContain("limactl shell test-vm -- sudo docker create");
        expect(cmd).toContain("--runtime=runsc");
        expect(cmd).toContain("--memory=1024m");
        expect(cmd).toContain("--cpu-quota=100000");
        expect(cmd).toContain("-p 30000:3000/tcp");
        expect(cmd).toContain("-p 30001:8000/tcp");
        expect(cmd).toContain('-e "NODE_ENV=development"');
        expect(cmd).toContain('-e "PORT=3000"');
        callback(null, { stdout: mockContainerId, stderr: "" });
      });

      // Mock docker inspect command
      mockExec.mockImplementationOnce((cmd: string, callback: any) => {
        expect(cmd).toContain("docker inspect");
        callback(null, {
          stdout: JSON.stringify(mockContainerData),
          stderr: "",
        });
      });

      const result = await runtime.createContainer(testConfig);

      expect(result).toEqual({
        id: mockContainerId,
        name: "pinacle-pod-test-pod-123",
        status: "created",
        podId: "test-pod-123",
        internalIp: "172.17.0.2",
        ports: [],
        createdAt: new Date("2023-01-01T00:00:00Z"),
        startedAt: undefined,
        stoppedAt: undefined,
      });
    });

    it("should handle container creation failure", async () => {
      mockExec.mockImplementationOnce((_cmd: string, callback: any) => {
        callback(new Error("Docker daemon not running"), {
          stdout: "",
          stderr: "Error",
        });
      });

      await expect(runtime.createContainer(testConfig)).rejects.toThrow(
        "Container creation failed",
      );
    });
  });

  describe("startContainer", () => {
    it("should start a container", async () => {
      const containerId = "container-123";

      mockExec.mockImplementationOnce((cmd: string, callback: any) => {
        expect(cmd).toContain("docker start");
        expect(cmd).toContain(containerId);
        callback(null, { stdout: "", stderr: "" });
      });

      await expect(
        runtime.startContainer(containerId),
      ).resolves.toBeUndefined();
    });
  });

  describe("stopContainer", () => {
    it("should stop a container", async () => {
      const containerId = "container-123";

      mockExec.mockImplementationOnce((cmd: string, callback: any) => {
        expect(cmd).toContain("docker stop");
        expect(cmd).toContain(containerId);
        callback(null, { stdout: "", stderr: "" });
      });

      await expect(runtime.stopContainer(containerId)).resolves.toBeUndefined();
    });
  });

  describe("getContainer", () => {
    it("should return container info", async () => {
      const containerId = "container-123";
      const mockContainerData = {
        Id: containerId,
        Name: "/pinacle-pod-test-123",
        State: {
          Status: "running",
          StartedAt: "2023-01-01T01:00:00Z",
          FinishedAt: "0001-01-01T00:00:00Z",
        },
        Created: "2023-01-01T00:00:00Z",
        NetworkSettings: {
          IPAddress: "172.17.0.2",
          Ports: {
            "3000/tcp": [{ HostPort: "30000" }],
            "8000/tcp": [{ HostPort: "30001" }],
          },
        },
      };

      mockExec.mockImplementationOnce((cmd: string, callback: any) => {
        expect(cmd).toContain("docker inspect");
        callback(null, {
          stdout: JSON.stringify(mockContainerData),
          stderr: "",
        });
      });

      const result = await runtime.getContainer(containerId);

      expect(result).toEqual({
        id: containerId,
        name: "pinacle-pod-test-123",
        status: "running",
        podId: "test-123",
        internalIp: "172.17.0.2",
        ports: [
          {
            name: "port-3000",
            internal: 3000,
            external: 30000,
            protocol: "tcp",
          },
          {
            name: "port-8000",
            internal: 8000,
            external: 30001,
            protocol: "tcp",
          },
        ],
        createdAt: new Date("2023-01-01T00:00:00Z"),
        startedAt: new Date("2023-01-01T01:00:00Z"),
        stoppedAt: undefined,
      });
    });

    it("should return null for non-existent container", async () => {
      mockExec.mockImplementationOnce((_cmd: string, callback: any) => {
        const error = new Error("No such container");
        callback(error, { stdout: "", stderr: "No such container" });
      });

      const result = await runtime.getContainer("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("execCommand", () => {
    it("should execute command in container", async () => {
      const containerId = "container-123";
      const command = ["echo", "hello world"];

      mockExec.mockImplementationOnce((cmd: string, callback: any) => {
        expect(cmd).toContain("docker exec");
        expect(cmd).toContain(containerId);
        expect(cmd).toContain("echo");
        callback(null, { stdout: "hello world\n", stderr: "" });
      });

      const result = await runtime.execInContainer(
        "test-pod",
        containerId,
        command,
      );

      expect(result).toEqual({
        stdout: "hello world\n",
        stderr: "",
        exitCode: 0,
      });
    });

    it("should handle command execution failure", async () => {
      const containerId = "container-123";
      const command = ["false"];

      mockExec.mockImplementationOnce((_cmd: string, callback: any) => {
        const error = new Error("Command failed");
        (error as any).code = 1;
        callback(error, { stdout: "", stderr: "Command failed" });
      });

      const result = await runtime.execInContainer(
        "test-pod",
        containerId,
        command,
      );

      expect(result).toEqual({
        stdout: "",
        stderr: "Command failed",
        exitCode: 1,
      });
    });
  });

  describe("validateGVisorRuntime", () => {
    it("should validate gVisor runtime is available", async () => {
      mockExec.mockImplementationOnce((cmd: string, callback: any) => {
        expect(cmd).toContain("docker info");
        callback(null, { stdout: "Runtimes: runc runsc", stderr: "" });
      });

      const result = await runtime.validateGVisorRuntime();
      expect(result).toBe(true);
    });

    it("should return false if gVisor runtime is not available", async () => {
      mockExec.mockImplementationOnce((_cmd: string, callback: any) => {
        callback(null, { stdout: "Runtimes: runc", stderr: "" });
      });

      const result = await runtime.validateGVisorRuntime();
      expect(result).toBe(false);
    });
  });
});
