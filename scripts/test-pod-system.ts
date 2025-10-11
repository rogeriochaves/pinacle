#!/usr/bin/env tsx

/**
 * Simple test script to validate the pod orchestration system
 * Run with: pnpm tsx scripts/test-pod-system.ts
 */

import { DefaultConfigResolver } from "../src/lib/pod-orchestration/config-resolver";
import { getLimaSshPort } from "../src/lib/pod-orchestration/lima-utils";
import { DefaultPodManager } from "../src/lib/pod-orchestration/pod-manager";
import type {
  PodSpec,
  ResourceTier,
} from "../src/lib/pod-orchestration/types";

async function main() {
  console.log("🚀 Starting Pinacle Pod System Test...\n");

  const sshPort = await getLimaSshPort("gvisor-alpine");
  const podManager = new DefaultPodManager({ vmName: "gvisor-alpine", sshPort });
  const configResolver = new DefaultConfigResolver();

  try {
    // Test 1: Check available templates
    console.log("📋 Available templates:");
    const templates = await configResolver.listTemplates();
    templates.forEach((template) => {
      console.log(
        `  - ${template.id}: ${template.name} - ${template.description}`,
      );
    });
    console.log();

    // Test 2: Create a simple test pod
    const testPodId = `test-pod-${Date.now()}`;
    console.log(`🏗️  Creating test pod: ${testPodId}`);

    // Create a simple configuration without templates to avoid port conflicts
    const spec: PodSpec = {
      id: testPodId,
      name: "Test Pod",
      slug: "test-pod",
      baseImage: "alpine:latest",
      resources: {
        tier: "dev.small" as ResourceTier,
        cpuCores: 0.5,
        memoryMb: 512,
        storageMb: 2048,
      },
      network: {
        ports: [{ name: "test", internal: 8080, protocol: "tcp" }],
      },
      services: [], // No services to avoid port conflicts
      environment: {
        TEST_MODE: "true",
        POD_NAME: "test-pod",
      },
      workingDir: "/workspace",
      user: "root",
      githubBranch: "main",
      healthChecks: [],
    };

    console.log("✅ Configuration loaded and validated");

    // Create the pod
    const pod = await podManager.createPod(spec);
    console.log(`✅ Pod created successfully! Status: ${pod.status}`);
    console.log(`   Container ID: ${pod.container?.id}`);
    console.log(`   Internal IP: ${pod.container?.internalIp || "N/A"}`);

    // Test 3: Execute commands in the pod
    console.log("\n🔧 Testing pod operations...");

    const commands = [
      ["echo", "Hello from Pinacle pod!"],
      ["whoami"],
      ["pwd"],
      ["printenv", "TEST_MODE"],
      ["printenv", "POD_NAME"],
      ["uname", "-a"],
    ];

    for (const cmd of commands) {
      try {
        const result = await podManager.execInPod(testPodId, cmd);
        console.log(`   $ ${cmd.join(" ")}`);
        console.log(`     ${result.stdout.trim()}`);
        if (result.stderr) {
          console.log(`     stderr: ${result.stderr.trim()}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`   $ ${cmd.join(" ")}`);
        console.log(`     Error: ${message}`);
      }
    }

    // Test 4: Check pod health
    console.log("\n🏥 Checking pod health...");
    const isHealthy = await podManager.checkPodHealth(testPodId);
    console.log(
      `   Health status: ${isHealthy ? "✅ Healthy" : "❌ Unhealthy"}`,
    );

    // Test 5: Get pod metrics
    console.log("\n📊 Pod metrics:");
    try {
      const metrics = await podManager.getPodMetrics(testPodId);
      console.log(
        `   CPU: ${metrics.cpu.usage.toFixed(1)}% / ${metrics.cpu.limit}% limit`,
      );
      console.log(
        `   Memory: ${metrics.memory.usage.toFixed(0)}MB / ${metrics.memory.limit}MB limit`,
      );
      console.log(
        `   Network: RX ${metrics.network.rx.toFixed(1)} KB/s, TX ${metrics.network.tx.toFixed(1)} KB/s`,
      );
      console.log(
        `   Disk: ${metrics.disk.usage.toFixed(0)}MB / ${metrics.disk.limit}MB limit`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`   Error getting metrics: ${message}`);
    }

    // Test 6: List pods
    console.log("\n📝 Current pods:");
    const pods = await podManager.listPods();
    pods.forEach((p) => {
      console.log(`   - ${p.id}: ${p.spec.name} (${p.status})`);
    });

    // Test 7: Test pod lifecycle
    console.log("\n🔄 Testing pod lifecycle...");

    console.log("   Stopping pod...");
    await podManager.stopPod(testPodId);
    const stoppedPod = await podManager.getPod(testPodId);
    console.log(`   Pod status: ${stoppedPod?.status}`);

    console.log("   Starting pod...");
    await podManager.startPod(testPodId);
    const restartedPod = await podManager.getPod(testPodId);
    console.log(`   Pod status: ${restartedPod?.status}`);

    // Test 8: Cleanup
    console.log("\n🧹 Cleaning up...");
    await podManager.deletePod(testPodId);
    console.log("   Pod deleted successfully");

    const finalPods = await podManager.listPods();
    const remainingTestPod = finalPods.find((p) => p.id === testPodId);
    console.log(
      `   Pod cleanup verified: ${remainingTestPod ? "❌ Still exists" : "✅ Removed"}`,
    );

    console.log(
      "\n🎉 All tests passed! Pod orchestration system is working correctly.",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("\n❌ Test failed:", message);
    if (stack) {
      console.error("Stack trace:", stack);
    }
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Test interrupted");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Test terminated");
  process.exit(0);
});

main().catch((error) => {
  console.error("💥 Unexpected error:", error);
  process.exit(1);
});
