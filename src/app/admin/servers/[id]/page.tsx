"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { MetricsChart } from "@/components/admin/metrics-chart";
import { PodRow } from "@/components/admin/pod-row";
import { getServerDisplayStatus } from "@/lib/server-status";
import { api } from "@/lib/trpc/client";

const formatBytes = (mb: number): string => {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb.toFixed(0)} MB`;
};

export default function ServerDetailPage() {
  const params = useParams();
  const serverId = params?.id as string;

  const {
    data: server,
    isLoading: serverLoading,
    refetch: refetchServer,
  } = api.admin.getServerById.useQuery({ serverId });

  const { data: metricsHistory, refetch: refetchMetrics } =
    api.admin.getServerMetricsHistory.useQuery(
      { serverId, hoursAgo: 24 },
      { enabled: !!server },
    );

  const {
    data: pods,
    isLoading: podsLoading,
    refetch: refetchPods,
  } = api.admin.getPodsOnServer.useQuery({ serverId });

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      void refetchServer();
      void refetchMetrics();
      void refetchPods();
    }, 5000);

    return () => clearInterval(interval);
  }, [refetchServer, refetchMetrics, refetchPods]);

  if (serverLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Server not found</h1>
          <Link
            href="/admin"
            className="mt-4 inline-flex items-center text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to servers
          </Link>
        </div>
      </div>
    );
  }

  const metrics = server.latestMetrics;
  const displayStatus = getServerDisplayStatus(
    server.status,
    server.lastHeartbeatAt,
  );
  const cpuPercent = metrics?.cpuUsagePercent || 0;
  const memoryPercent = metrics
    ? (metrics.memoryUsageMb / server.memoryMb) * 100
    : 0;
  const diskPercent = metrics ? (metrics.diskUsageGb / server.diskGb) * 100 : 0;

  // Prepare data for charts
  const cpuData =
    metricsHistory?.map((m) => ({
      timestamp: m.timestamp,
      value: m.cpuUsagePercent,
    })) || [];

  const memoryData =
    metricsHistory?.map((m) => ({
      timestamp: m.timestamp,
      value: (m.memoryUsageMb / server.memoryMb) * 100,
    })) || [];

  const diskData =
    metricsHistory?.map((m) => ({
      timestamp: m.timestamp,
      value: (m.diskUsageGb / server.diskGb) * 100,
    })) || [];

  const activePodCountData =
    metricsHistory?.map((m) => ({
      timestamp: m.timestamp,
      value: m.activePodsCount,
    })) || [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to servers
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {server.hostname}
            </h1>
            <p className="mt-1 text-sm text-gray-500">{server.ipAddress}</p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                displayStatus === "Online"
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {displayStatus}
            </span>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
              Auto-refreshing
            </div>
          </div>
        </div>
      </div>

      {/* Server Info Card */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Server Information
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs font-medium text-gray-500">CPU Cores</div>
            <div className="mt-1 text-xl font-bold text-gray-900">
              {server.cpuCores}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">
              Total Memory
            </div>
            <div className="mt-1 text-xl font-bold text-gray-900">
              {formatBytes(server.memoryMb)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">Total Disk</div>
            <div className="mt-1 text-xl font-bold text-gray-900">
              {server.diskGb.toFixed(0)} GB
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">SSH</div>
            <div className="mt-1 text-sm font-mono text-gray-900">
              {server.sshUser}@{server.sshHost}:{server.sshPort}
            </div>
          </div>
        </div>

        {/* Current Resource Usage */}
        {metrics && (
          <div className="mt-6 space-y-4 border-t border-gray-100 pt-6">
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">CPU Usage</span>
                <span className="font-medium text-gray-900">
                  {cpuPercent.toFixed(1)}%
                </span>
              </div>
              <div className="mt-2 h-3 w-full rounded-full bg-gray-200">
                <div
                  className={`h-3 rounded-full transition-all ${
                    cpuPercent > 80
                      ? "bg-red-500"
                      : cpuPercent > 60
                        ? "bg-yellow-500"
                        : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(cpuPercent, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Memory Usage</span>
                <span className="font-medium text-gray-900">
                  {formatBytes(metrics.memoryUsageMb)} /{" "}
                  {formatBytes(server.memoryMb)} ({memoryPercent.toFixed(1)}%)
                </span>
              </div>
              <div className="mt-2 h-3 w-full rounded-full bg-gray-200">
                <div
                  className={`h-3 rounded-full transition-all ${
                    memoryPercent > 80
                      ? "bg-red-500"
                      : memoryPercent > 60
                        ? "bg-yellow-500"
                        : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(memoryPercent, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Disk Usage</span>
                <span className="font-medium text-gray-900">
                  {metrics.diskUsageGb.toFixed(1)} GB /{" "}
                  {server.diskGb.toFixed(0)} GB ({diskPercent.toFixed(1)}%)
                </span>
              </div>
              <div className="mt-2 h-3 w-full rounded-full bg-gray-200">
                <div
                  className={`h-3 rounded-full transition-all ${
                    diskPercent > 80
                      ? "bg-red-500"
                      : diskPercent > 60
                        ? "bg-yellow-500"
                        : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(diskPercent, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Charts */}
      {metricsHistory && metricsHistory.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MetricsChart
            data={cpuData}
            title="CPU Usage (24h)"
            color="#ef4444"
            unit="%"
            maxValue={100}
            height={250}
          />
          <MetricsChart
            data={memoryData}
            title="Memory Usage (24h)"
            color="#3b82f6"
            unit="%"
            maxValue={100}
            height={250}
          />
          <MetricsChart
            data={diskData}
            title="Disk Usage (24h)"
            color="#10b981"
            unit="%"
            maxValue={100}
            height={250}
          />
          <MetricsChart
            data={activePodCountData}
            title="Active Pods (24h)"
            color="#8b5cf6"
            unit=""
            height={250}
          />
        </div>
      )}

      {/* Pods List */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Pods on this Server
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {pods?.length || 0} pod{pods?.length !== 1 ? "s" : ""} found
          </p>
        </div>

        {podsLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">
            Loading pods...
          </div>
        ) : !pods || pods.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No pods found on this server
          </div>
        ) : (
          <div>
            {pods.map((pod) => (
              <PodRow key={pod.id} pod={pod} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
