import { exec } from "child_process";
import { promisify } from "util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DefaultConfigResolver } from "../config-resolver";
import { LimaGVisorRuntime } from "../container-runtime";
import { LimaNetworkManager } from "../network-manager";
import { DefaultPodManager } from "../pod-manager";
import type { PodConfig, ResourceTier } from "../types";

const execAsync = promisify(exec);

// Integration tests that run against actual Lima VM
describe("Pod Orchestration Integration Tests", () => {
  let podManager: DefaultPodManager;
  let configResolver: DefaultConfigResolver;
  let testPodId: string;

  beforeAll(async () => {
    // Check if Lima VM is running
    try {
      const { stdout } = await execAsync("limactl list --format json");
      const vms = stdout
        .trim()
        .split("\n")
        .map((json) => JSON.parse(json));
      const vm = vms.find(
        (vm) => vm.name === "gvisor-alpine" && vm.status === "Running",
      );

      if (!vm) {
        throw new Error(
          "gvisor-alpine Lima VM is not running. Start it with: limactl start gvisor-alpine",
        );
      }

      console.log(`✅ Lima VM ${vm.name} is running`);
    } catch (error) {
      console.error("Lima VM check failed:", error);
      throw error;
    }

    const limaConfig = { vmName: "gvisor-alpine" };
    podManager = new DefaultPodManager(limaConfig);
    const containerRuntime = new LimaGVisorRuntime(limaConfig);

    const containers = await containerRuntime.listContainers();
    const testContainers = containers.filter(
      (p) =>
        p.podId.startsWith("lifecycle-test-") ||
        p.podId.startsWith("test-integration-") ||
        p.podId.startsWith("proxy-test-") ||
        p.podId.includes("template-test"),
    );
    for (const container of testContainers) {
      await containerRuntime.removeContainer(container.id);
    }

    const networkManager = new LimaNetworkManager(limaConfig);

    // Delete all networks that start with "integration-test-"
    const networks = await networkManager.listPodNetworks();
    const integrationTestNetworks = networks.filter(
      (n) =>
        n.podId.startsWith("lifecycle-test-") ||
        n.podId.startsWith("test-integration-") ||
        n.podId.startsWith("proxy-test-") ||
        n.podId.includes("template-test"),
    );
    for (const network of integrationTestNetworks) {
      await networkManager.destroyPodNetwork(network.podId);
    }

    configResolver = new DefaultConfigResolver();
    testPodId = `test-integration-${Date.now()}`;
  }, 60_000);

  it.skip("should create, start, and manage a simple pod", async () => {
    // Create a simple test configuration
    const config: PodConfig = {
      id: testPodId,
      name: "Integration Test Pod",
      slug: "integration-test-pod",
      templateId: "custom",
      baseImage: "alpine:latest",
      resources: {
        tier: "dev.small" as ResourceTier,
        cpuCores: 0.5,
        memoryMb: 256,
        storageMb: 1024,
      },
      network: {
        ports: [{ name: "test", internal: 8080, protocol: "tcp" }],
      },
      services: [],
      environment: {
        TEST_VAR: "integration-test",
      },
      workingDir: "/workspace",
      user: "root",
      githubBranch: "main",
      healthChecks: [],
    };

    // Validate configuration
    const validation = await configResolver.validateConfig(config);
    expect(validation.valid).toBe(true);

    // Create pod
    console.log("Creating pod...");
    const pod = await podManager.createPod(config);

    expect(pod.id).toBe(testPodId);
    expect(pod.status).toBe("running");
    expect(pod.container).toBeDefined();
    expect(pod.container?.id).toBeTruthy();

    // Wait a bit more for container to be fully ready
    console.log("Waiting for container to be fully ready...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Test pod operations
    console.log("Testing pod operations...");

    // Execute command in pod
    const execResult = await podManager.execInPod(testPodId, [
      "echo",
      "Hello from pod!",
    ]);
    expect(execResult.exitCode).toBe(0);
    expect(execResult.stdout.trim()).toBe("Hello from pod!");

    // Check environment variable
    const envResult = await podManager.execInPod(testPodId, [
      "printenv",
      "TEST_VAR",
    ]);
    expect(envResult.exitCode).toBe(0);
    expect(envResult.stdout.trim()).toBe("integration-test");

    // Check health
    const isHealthy = await podManager.checkPodHealth(testPodId);
    expect(isHealthy).toBe(true);

    // Get pod info
    const podInfo = await podManager.getPod(testPodId);
    console.log("podInfo", podInfo);
    expect(podInfo?.status).toBe("running");
    expect(podInfo?.container?.status).toBe("created");

    // Test metrics (basic check)
    const metrics = await podManager.getPodMetrics(testPodId);
    expect(metrics.cpu.limit).toBe(50); // 0.5 CPU * 100
    expect(metrics.memory.limit).toBe(256);

    console.log("Integration test pod created successfully!");
  }, 60000); // 60 second timeout for integration test

  it.skip("should handle pod lifecycle correctly", async () => {
    const lifecycleTestId = `lifecycle-test-${Date.now()}`;

    const config: PodConfig = {
      id: lifecycleTestId,
      name: "Lifecycle Test Pod",
      slug: "lifecycle-test-pod",
      baseImage: "alpine:latest",
      resources: {
        tier: "dev.small" as ResourceTier,
        cpuCores: 0.25,
        memoryMb: 128,
        storageMb: 512,
      },
      network: {
        ports: [],
      },
      services: [],
      environment: {},
      workingDir: "/workspace",
      user: "root",
      githubBranch: "main",
      healthChecks: [],
      hooks: {
        postStart: ['echo "Pod started" > /tmp/started.txt'],
        preStop: ['echo "Pod stopping" > /tmp/stopping.txt'],
      },
    };

    // Create pod
    console.log("Creating lifecycle test pod...");
    await podManager.createPod(config);

    let pod = await podManager.getPod(lifecycleTestId);
    expect(pod?.status).toBe("running");

    // wait
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Check post-start hook worked
    const hookResult = await podManager.execInPod(lifecycleTestId, [
      "cat",
      "/tmp/started.txt",
    ]);
    expect(hookResult.exitCode).toBe(0);
    expect(hookResult.stdout.trim()).toBe("Pod started");

    // Stop pod
    console.log("Stopping lifecycle test pod...");
    await podManager.stopPod(lifecycleTestId);

    pod = await podManager.getPod(lifecycleTestId);
    expect(pod?.status).toBe("stopped");

    // Start pod again
    console.log("Restarting lifecycle test pod...");
    await podManager.startPod(lifecycleTestId);

    pod = await podManager.getPod(lifecycleTestId);
    expect(pod?.status).toBe("running");

    // Delete pod
    console.log("Deleting lifecycle test pod...");
    await podManager.deletePod(lifecycleTestId);

    pod = await podManager.getPod(lifecycleTestId);
    expect(pod).toBeNull();

    console.log("Lifecycle test completed successfully!");
  }, 90000); // 90 second timeout

  it.skip("should list and filter pods correctly", async () => {
    const listTestId1 = `list-test-1-${Date.now()}`;
    const listTestId2 = `list-test-2-${Date.now()}`;

    const baseConfig: PodConfig = {
      id: "",
      name: "",
      slug: "",
      baseImage: "alpine:latest",
      resources: {
        tier: "dev.small" as ResourceTier,
        cpuCores: 0.25,
        memoryMb: 128,
        storageMb: 512,
      },
      network: { ports: [] },
      services: [],
      environment: {},
      workingDir: "/workspace",
      user: "root",
      githubBranch: "main",
      healthChecks: [],
    };

    const config1: PodConfig = {
      ...baseConfig,
      id: listTestId1,
      name: "List Test Pod 1",
      slug: "list-test-pod-1",
      templateId: "nextjs",
    };

    const config2: PodConfig = {
      ...baseConfig,
      id: listTestId2,
      name: "List Test Pod 2",
      slug: "list-test-pod-2",
      templateId: "custom",
    };

    // Create test pods
    await podManager.createPod(config1);
    await podManager.createPod(config2);

    // List all pods
    const allPods = await podManager.listPods();
    expect(allPods.length).toBeGreaterThanOrEqual(2);

    // Filter by status
    const runningPods = await podManager.listPods({ status: "running" });
    const testPods = runningPods.filter(
      (p) => p.id === listTestId1 || p.id === listTestId2,
    );
    expect(testPods).toHaveLength(2);

    // Filter by template
    const nextjsPods = await podManager.listPods({ templateId: "nextjs" });
    const nextjsTestPods = nextjsPods.filter((p) => p.id === listTestId1);
    expect(nextjsTestPods).toHaveLength(1);

    console.log("List and filter test completed successfully!");
  }, 120000); // 2 minute timeout

  it.only("should handle template-based pod creation", async () => {
    const templateTestId = `template-test-${Date.now()}`;

    // Use config resolver to load a template
    const config = await configResolver.loadConfig("nextjs", {
      id: templateTestId,
      name: "Template Test Pod",
      slug: "template-test-pod",
      environment: {
        CUSTOM_VAR: "template-test",
      },
    });

    expect(config.templateId).toBe("nextjs");
    expect(config.baseImage).toBe("pinacledev/pinacle-base");
    expect(config.environment.NODE_ENV).toBe("development");
    expect(config.environment.CUSTOM_VAR).toBe("template-test");

    // Create pod from template
    console.log("Creating template-based pod...");
    const pod = await podManager.createPod(config);

    expect(pod.id).toBe(templateTestId);
    expect(pod.status).toBe("running");

    // Verify template-specific configuration
    const envResult = await podManager.execInPod(templateTestId, [
      "printenv",
      "NODE_ENV",
    ]);
    expect(envResult.exitCode).toBe(0);
    expect(envResult.stdout.trim()).toBe("development");

    const customVarResult = await podManager.execInPod(templateTestId, [
      "printenv",
      "CUSTOM_VAR",
    ]);
    expect(customVarResult.exitCode).toBe(0);
    expect(customVarResult.stdout.trim()).toBe("template-test");

    console.log("Template test completed successfully!");
  }, 90000);

  it("should route requests via hostname-based Nginx proxy", async () => {
    const proxyTestId = `proxy-test-${Date.now()}`;

    const config: PodConfig = {
      id: proxyTestId,
      name: "Proxy Test Pod",
      slug: "proxy-test-pod",
      baseImage: "pinacledev/pinacle-base",
      resources: {
        tier: "dev.small" as ResourceTier,
        cpuCores: 0.5,
        memoryMb: 256,
        storageMb: 1024,
      },
      network: {
        ports: [], // Will be populated with nginx-proxy port
      },
      services: [],
      environment: {
        TEST_ENV: "hostname-routing",
      },
      workingDir: "/workspace",
      user: "root",
      githubBranch: "main",
      healthChecks: [],
    };

    // Create pod
    console.log("Creating pod with Nginx proxy...");
    const pod = await podManager.createPod(config);

    expect(pod.status).toBe("running");
    expect(pod.config.network.ports).toHaveLength(1);
    expect(pod.config.network.ports[0].name).toBe("nginx-proxy");
    expect(pod.config.network.ports[0].internal).toBe(80);
    expect(pod.config.network.ports[0].external).toBeGreaterThanOrEqual(30000);

    const proxyPort = pod.config.network.ports[0].external!;
    console.log(`✅ Nginx proxy exposed on port ${proxyPort}`);

    // Wait for container to be fully ready
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check that Nginx is running
    const nginxCheck = await podManager.execInPod(proxyTestId, [
      "rc-service",
      "nginx",
      "status",
    ]);
    console.log("Nginx status:", nginxCheck.stdout);

    // Start a simple HTTP server on port 3000 inside the container
    console.log("Starting test HTTP server on port 3000...");
    await podManager.execInPod(proxyTestId, [
      "sh",
      "-c",
      "mkdir -p /tmp/test-server && echo 'Hello from port 3000!' > /tmp/test-server/index.html",
    ]);

    // Start Python HTTP server in the background (using nohup)
    await podManager.execInPod(proxyTestId, [
      "sh",
      "-c",
      "cd /tmp/test-server && nohup python3 -m http.server 3000 > /tmp/server-3000.log 2>&1 &",
    ]);

    // Start another server on port 8080
    console.log("Starting test HTTP server on port 8080...");
    await podManager.execInPod(proxyTestId, [
      "sh",
      "-c",
      "mkdir -p /tmp/test-server-8080 && echo 'Hello from port 8080!' > /tmp/test-server-8080/index.html",
    ]);

    await podManager.execInPod(proxyTestId, [
      "sh",
      "-c",
      "cd /tmp/test-server-8080 && nohup python3 -m http.server 8080 > /tmp/server-8080.log 2>&1 &",
    ]);

    // Wait for servers to start
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Test that we can access the servers via Nginx proxy from inside the container
    console.log("Testing Nginx proxy from inside container...");

    // Test port 3000 via hostname routing from inside container
    const test3000 = await podManager.execInPod(proxyTestId, [
      "wget",
      "-O-",
      "-q",
      "--header=Host: localhost-3000.pod-proxy-test-pod.pinacle.dev",
      "http://localhost:80",
    ]);
    console.log("Port 3000 response (from container):", test3000.stdout);
    expect(test3000.stdout.trim()).toBe("Hello from port 3000!");

    // Test port 8080 via hostname routing from inside container
    const test8080 = await podManager.execInPod(proxyTestId, [
      "wget",
      "-O-",
      "-q",
      "--header=Host: localhost-8080.pod-proxy-test-pod.pinacle.dev",
      "http://localhost:80",
    ]);
    console.log("Port 8080 response (from container):", test8080.stdout);
    expect(test8080.stdout.trim()).toBe("Hello from port 8080!");

    // Test from Mac using curl (this tests the full Lima port forwarding + hostname routing)
    console.log("Testing from Mac via curl...");
    const curlTest3000 = await execAsync(
      `curl -s -H "Host: localhost-3000.pod-proxy-test-pod.localhost" http://localhost:${proxyPort}`
    );
    console.log("Port 3000 response (from Mac):", curlTest3000.stdout.trim());
    expect(curlTest3000.stdout.trim()).toBe("Hello from port 3000!");

    const curlTest8080 = await execAsync(
      `curl -s -H "Host: localhost-8080.pod-proxy-test-pod.localhost" http://localhost:${proxyPort}`
    );
    console.log("Port 8080 response (from Mac):", curlTest8080.stdout.trim());
    expect(curlTest8080.stdout.trim()).toBe("Hello from port 8080!");

    console.log("✅ Hostname-based routing test completed successfully!");
    console.log(`📝 Access these services from your Mac/browser at:`);
    console.log(`   http://localhost-3000.pod-${pod.config.slug}.localhost:${proxyPort}`);
    console.log(`   http://localhost-8080.pod-${pod.config.slug}.localhost:${proxyPort}`);
  }, 120000); // 2 minute timeout
});
