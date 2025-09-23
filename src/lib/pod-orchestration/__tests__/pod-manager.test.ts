import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultPodManager } from "../pod-manager";
import type { PodConfig, ResourceTier } from "../types";

// Mock the dependencies
vi.mock("../container-runtime");
vi.mock("../network-manager");
vi.mock("../service-provisioner");
vi.mock("../config-resolver");

describe("DefaultPodManager", () => {
  let podManager: DefaultPodManager;
  let testConfig: PodConfig;

  beforeEach(() => {
    podManager = new DefaultPodManager({ vmName: "test-vm" });

    testConfig = {
      id: "test-pod-123",
      name: "Test Pod",
      slug: "test-pod",
      baseImage: "ubuntu:22.04",
      resources: {
        tier: "dev.small" as ResourceTier,
        cpuCores: 1,
        memoryMb: 1024,
        storageMb: 10240,
      },
      network: {
        ports: [{ name: "app", internal: 3000, protocol: "tcp" }],
      },
      services: [
        {
          name: "code-server",
          enabled: true,
          autoRestart: true,
          dependsOn: [],
        },
      ],
      environment: {
        NODE_ENV: "development",
      },
      workingDir: "/workspace",
      user: "root",
      githubBranch: "main",
      healthChecks: [],
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createPod", () => {
    it("should create a pod successfully", async () => {
      // Mock the dependencies
      const mockConfigResolver = {
        validateConfig: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
      };

      const mockNetworkManager = {
        createPodNetwork: vi.fn().mockResolvedValue("10.100.1.2"),
        allocatePort: vi.fn().mockResolvedValue(30000),
        setupPortForwarding: vi.fn().mockResolvedValue(undefined),
      };

      const mockContainerRuntime = {
        createContainer: vi.fn().mockResolvedValue({
          id: "container-123",
          name: "pinacle-pod-test-pod-123",
          status: "created",
          podId: "test-pod-123",
          ports: [],
          createdAt: new Date(),
        }),
        startContainer: vi.fn().mockResolvedValue(undefined),
      };

      const mockServiceProvisioner = {
        provisionService: vi.fn().mockResolvedValue(undefined),
        startService: vi.fn().mockResolvedValue(undefined),
      };

      // Replace the private properties (this is a test-specific approach)
      (podManager as any).configResolver = mockConfigResolver;
      (podManager as any).networkManager = mockNetworkManager;
      (podManager as any).containerRuntime = mockContainerRuntime;
      (podManager as any).serviceProvisioner = mockServiceProvisioner;

      const result = await podManager.createPod(testConfig);

      expect(result.id).toBe("test-pod-123");
      expect(result.status).toBe("running");
      expect(result.config).toEqual(testConfig);
      expect(mockConfigResolver.validateConfig).toHaveBeenCalledWith(
        testConfig,
      );
      expect(mockNetworkManager.createPodNetwork).toHaveBeenCalledWith(
        "test-pod-123",
        testConfig.network,
      );
      expect(mockContainerRuntime.createContainer).toHaveBeenCalledWith(
        testConfig,
      );
      expect(mockContainerRuntime.startContainer).toHaveBeenCalledWith(
        "container-123",
      );
      expect(mockServiceProvisioner.provisionService).toHaveBeenCalledWith(
        "test-pod-123",
        testConfig.services[0],
      );
      expect(mockServiceProvisioner.startService).toHaveBeenCalledWith(
        "test-pod-123",
        "code-server",
      );
    });

    it("should handle validation errors", async () => {
      const mockConfigResolver = {
        validateConfig: vi.fn().mockResolvedValue({
          valid: false,
          errors: ["Invalid port configuration"],
        }),
      };

      (podManager as any).configResolver = mockConfigResolver;

      await expect(podManager.createPod(testConfig)).rejects.toThrow(
        "Invalid configuration",
      );
    });

    it("should cleanup on creation failure", async () => {
      const mockConfigResolver = {
        validateConfig: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
      };

      const mockNetworkManager = {
        createPodNetwork: vi
          .fn()
          .mockRejectedValue(new Error("Network creation failed")),
        destroyPodNetwork: vi.fn().mockResolvedValue(undefined),
        releasePort: vi.fn().mockResolvedValue(undefined),
      };

      (podManager as any).configResolver = mockConfigResolver;
      (podManager as any).networkManager = mockNetworkManager;

      await expect(podManager.createPod(testConfig)).rejects.toThrow(
        "Network creation failed",
      );

      // Should have attempted cleanup
      expect(mockNetworkManager.destroyPodNetwork).toHaveBeenCalledWith(
        "test-pod-123",
      );
    });
  });

  describe("startPod", () => {
    it("should start a stopped pod", async () => {
      // First create a pod
      const pod = {
        id: "test-pod-123",
        config: testConfig,
        status: "stopped" as const,
        container: {
          id: "container-123",
          name: "test-container",
          status: "stopped" as const,
          podId: "test-pod-123",
          ports: [],
          createdAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (podManager as any).pods.set("test-pod-123", pod);

      const mockContainerRuntime = {
        startContainer: vi.fn().mockResolvedValue(undefined),
      };

      const mockServiceProvisioner = {
        startService: vi.fn().mockResolvedValue(undefined),
      };

      (podManager as any).containerRuntime = mockContainerRuntime;
      (podManager as any).serviceProvisioner = mockServiceProvisioner;

      await podManager.startPod("test-pod-123");

      const updatedPod = await podManager.getPod("test-pod-123");
      expect(updatedPod?.status).toBe("running");
      expect(mockContainerRuntime.startContainer).toHaveBeenCalledWith(
        "container-123",
      );
      expect(mockServiceProvisioner.startService).toHaveBeenCalledWith(
        "test-pod-123",
        "code-server",
      );
    });

    it("should handle non-existent pod", async () => {
      await expect(podManager.startPod("non-existent")).rejects.toThrow(
        "Pod not found",
      );
    });
  });

  describe("stopPod", () => {
    it("should stop a running pod", async () => {
      const pod = {
        id: "test-pod-123",
        config: testConfig,
        status: "running" as const,
        container: {
          id: "container-123",
          name: "test-container",
          status: "running" as const,
          podId: "test-pod-123",
          ports: [],
          createdAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (podManager as any).pods.set("test-pod-123", pod);

      const mockContainerRuntime = {
        stopContainer: vi.fn().mockResolvedValue(undefined),
      };

      const mockServiceProvisioner = {
        stopService: vi.fn().mockResolvedValue(undefined),
      };

      (podManager as any).containerRuntime = mockContainerRuntime;
      (podManager as any).serviceProvisioner = mockServiceProvisioner;

      await podManager.stopPod("test-pod-123");

      const updatedPod = await podManager.getPod("test-pod-123");
      expect(updatedPod?.status).toBe("stopped");
      expect(mockContainerRuntime.stopContainer).toHaveBeenCalledWith(
        "container-123",
      );
      expect(mockServiceProvisioner.stopService).toHaveBeenCalledWith(
        "test-pod-123",
        "code-server",
      );
    });
  });

  describe("deletePod", () => {
    it("should delete a pod and cleanup resources", async () => {
      const pod = {
        id: "test-pod-123",
        config: testConfig,
        status: "stopped" as const,
        container: {
          id: "container-123",
          name: "test-container",
          status: "stopped" as const,
          podId: "test-pod-123",
          ports: [],
          createdAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (podManager as any).pods.set("test-pod-123", pod);

      const mockContainerRuntime = {
        removeContainer: vi.fn().mockResolvedValue(undefined),
      };

      const mockNetworkManager = {
        removePortForwarding: vi.fn().mockResolvedValue(undefined),
        destroyPodNetwork: vi.fn().mockResolvedValue(undefined),
        releasePort: vi.fn().mockResolvedValue(undefined),
      };

      const mockServiceProvisioner = {
        removeService: vi.fn().mockResolvedValue(undefined),
      };

      (podManager as any).containerRuntime = mockContainerRuntime;
      (podManager as any).networkManager = mockNetworkManager;
      (podManager as any).serviceProvisioner = mockServiceProvisioner;

      await podManager.deletePod("test-pod-123");

      const deletedPod = await podManager.getPod("test-pod-123");
      expect(deletedPod).toBeNull();
      expect(mockContainerRuntime.removeContainer).toHaveBeenCalledWith(
        "container-123",
      );
      expect(mockNetworkManager.destroyPodNetwork).toHaveBeenCalledWith(
        "test-pod-123",
      );
      expect(mockServiceProvisioner.removeService).toHaveBeenCalledWith(
        "test-pod-123",
        "code-server",
      );
    });
  });

  describe("listPods", () => {
    it("should list all pods", async () => {
      const pod1 = {
        id: "pod-1",
        config: { ...testConfig, id: "pod-1", name: "Pod 1" },
        status: "running" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const pod2 = {
        id: "pod-2",
        config: {
          ...testConfig,
          id: "pod-2",
          name: "Pod 2",
          templateId: "nextjs",
        },
        status: "stopped" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (podManager as any).pods.set("pod-1", pod1);
      (podManager as any).pods.set("pod-2", pod2);

      const allPods = await podManager.listPods();
      expect(allPods).toHaveLength(2);

      const runningPods = await podManager.listPods({ status: "running" });
      expect(runningPods).toHaveLength(1);
      expect(runningPods[0].id).toBe("pod-1");

      const nextjsPods = await podManager.listPods({ templateId: "nextjs" });
      expect(nextjsPods).toHaveLength(1);
      expect(nextjsPods[0].id).toBe("pod-2");
    });
  });

  describe("checkPodHealth", () => {
    it("should check pod health", async () => {
      const pod = {
        id: "test-pod-123",
        config: testConfig,
        status: "running" as const,
        container: {
          id: "container-123",
          name: "test-container",
          status: "running" as const,
          podId: "test-pod-123",
          ports: [],
          createdAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (podManager as any).pods.set("test-pod-123", pod);

      const mockContainerRuntime = {
        getContainer: vi.fn().mockResolvedValue({
          id: "container-123",
          status: "running",
        }),
      };

      const mockServiceProvisioner = {
        checkServiceHealth: vi.fn().mockResolvedValue(true),
      };

      (podManager as any).containerRuntime = mockContainerRuntime;
      (podManager as any).serviceProvisioner = mockServiceProvisioner;

      const isHealthy = await podManager.checkPodHealth("test-pod-123");

      expect(isHealthy).toBe(true);
      expect(mockContainerRuntime.getContainer).toHaveBeenCalledWith(
        "container-123",
      );
      expect(mockServiceProvisioner.checkServiceHealth).toHaveBeenCalledWith(
        "test-pod-123",
        "code-server",
      );
    });

    it("should return false for unhealthy pod", async () => {
      const pod = {
        id: "test-pod-123",
        config: testConfig,
        status: "running" as const,
        container: {
          id: "container-123",
          name: "test-container",
          status: "running" as const,
          podId: "test-pod-123",
          ports: [],
          createdAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (podManager as any).pods.set("test-pod-123", pod);

      const mockContainerRuntime = {
        getContainer: vi.fn().mockResolvedValue({
          id: "container-123",
          status: "stopped",
        }),
      };

      (podManager as any).containerRuntime = mockContainerRuntime;

      const isHealthy = await podManager.checkPodHealth("test-pod-123");
      expect(isHealthy).toBe(false);
    });
  });

  describe("execInPod", () => {
    it("should execute command in pod", async () => {
      const pod = {
        id: "test-pod-123",
        config: testConfig,
        status: "running" as const,
        container: {
          id: "container-123",
          name: "test-container",
          status: "running" as const,
          podId: "test-pod-123",
          ports: [],
          createdAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (podManager as any).pods.set("test-pod-123", pod);

      const mockContainerRuntime = {
        execCommand: vi.fn().mockResolvedValue({
          stdout: "hello world",
          stderr: "",
          exitCode: 0,
        }),
      };

      (podManager as any).containerRuntime = mockContainerRuntime;

      const result = await podManager.execInPod("test-pod-123", [
        "echo",
        "hello world",
      ]);

      expect(result).toEqual({
        stdout: "hello world",
        stderr: "",
        exitCode: 0,
      });
      expect(mockContainerRuntime.execCommand).toHaveBeenCalledWith(
        "container-123",
        ["echo", "hello world"],
      );
    });
  });
});
