"use client";

import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MetricsChart } from "@/components/admin/metrics-chart";
import {
  getResourcesFromTier,
  podRecordToPinacleConfig,
} from "@/lib/pod-orchestration/pinacle-config";
import { api } from "@/lib/trpc/client";

const formatBytes = (mb: number): string => {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb.toFixed(0)} MB`;
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
};

export default function PodDetailPage() {
  const params = useParams();
  const podId = params?.id as string;

  const { data, isLoading } = api.admin.getPodDetails.useQuery(
    { podId },
    {
      refetchInterval: 5000, // Auto-refresh every 5 seconds
    },
  );
  const { data: metricsHistory } = api.admin.getPodMetricsHistory.useQuery(
    { podId, hoursAgo: 24 },
    {
      enabled: !!data,
      refetchInterval: 30000, // Refresh metrics every 30 seconds
    },
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Pod not found</h1>
          <Link
            href="/admin"
            className="mt-4 inline-flex items-center text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { pod, owner, team, server, latestMetrics, logs } = data;

  // Parse pod config to get tier and other details
  const podConfig = podRecordToPinacleConfig({
    config: pod.config,
    name: pod.name,
  });

  // Derive resources from tier
  const resources = getResourcesFromTier(podConfig.tier);

  // Prepare data for charts
  const cpuData =
    metricsHistory?.map((m) => ({
      timestamp: m.timestamp,
      value: m.cpuUsagePercent,
    })) || [];

  const memoryData =
    metricsHistory?.map((m) => ({
      timestamp: m.timestamp,
      value: m.memoryUsageMb,
    })) || [];

  const diskData =
    metricsHistory?.map((m) => ({
      timestamp: m.timestamp,
      value: m.diskUsageMb,
    })) || [];

  const networkRxData =
    metricsHistory?.map((m) => ({
      timestamp: m.timestamp,
      value: m.networkRxBytes / 1024 / 1024,
    })) || [];

  const networkTxData =
    metricsHistory?.map((m) => ({
      timestamp: m.timestamp,
      value: m.networkTxBytes / 1024 / 1024,
    })) || [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={server ? `/admin/servers/${server.id}` : "/admin"}
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {server ? `Back to ${server.hostname}` : "Back to dashboard"}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{pod.name}</h1>
            {pod.description && (
              <p className="mt-1 text-sm text-gray-500">{pod.description}</p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
              Auto-refreshing every 5s
            </div>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                pod.status === "running"
                  ? "bg-green-100 text-green-800"
                  : pod.status === "stopped"
                    ? "bg-gray-100 text-gray-800"
                    : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {pod.status}
            </span>
          </div>
        </div>
      </div>

      {/* Pod Info Card */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Pod Information
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="text-xs font-medium text-gray-500">Pod ID</div>
            <div className="mt-1 font-mono text-sm text-gray-900">{pod.id}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">Tier</div>
            <div className="mt-1 text-sm text-gray-900">{podConfig.tier}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">
              Container ID
            </div>
            <div className="mt-1 font-mono text-xs text-gray-900">
              {pod.containerId || "N/A"}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">Owner</div>
            <div className="mt-1 text-sm text-gray-900">
              {owner ? (
                <Link
                  href={`/admin/users/${owner.id}`}
                  className="text-blue-600 hover:text-blue-700"
                >
                  {owner.name || owner.email}
                </Link>
              ) : (
                "Unknown"
              )}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">Team</div>
            <div className="mt-1 text-sm text-gray-900">
              {team ? (
                <Link
                  href={`/admin/teams/${team.id}`}
                  className="text-blue-600 hover:text-blue-700"
                >
                  {team.name}
                </Link>
              ) : (
                "Unknown"
              )}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">Server</div>
            <div className="mt-1 text-sm text-gray-900">
              {server ? (
                <Link
                  href={`/admin/servers/${server.id}`}
                  className="text-blue-600 hover:text-blue-700"
                >
                  {server.hostname}
                </Link>
              ) : (
                "Not assigned"
              )}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">CPU Cores</div>
            <div className="mt-1 text-sm text-gray-900">{resources.cpuCores}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">Memory</div>
            <div className="mt-1 text-sm text-gray-900">
              {formatBytes(resources.memoryMb)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">Storage</div>
            <div className="mt-1 text-sm text-gray-900">
              {formatBytes(resources.storageMb)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">Created</div>
            <div className="mt-1 text-sm text-gray-900">
              {new Date(pod.createdAt).toLocaleString()}
            </div>
          </div>
          {pod.publicUrl && (
            <div>
              <div className="text-xs font-medium text-gray-500">
                Public URL
              </div>
              <div className="mt-1 text-sm text-gray-900">
                <a
                  href={pod.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700"
                >
                  {pod.publicUrl}
                </a>
              </div>
            </div>
          )}
          {pod.githubRepo && (
            <div>
              <div className="text-xs font-medium text-gray-500">
                GitHub Repo
              </div>
              <div className="mt-1 text-sm text-gray-900">
                <a
                  href={`https://github.com/${pod.githubRepo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700"
                >
                  {pod.githubRepo}
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Current Metrics */}
        {latestMetrics && (
          <div className="mt-6 border-t border-gray-100 pt-6">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              Current Resource Usage
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-xs text-gray-500">CPU</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {latestMetrics.cpuUsagePercent.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Memory</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {formatBytes(latestMetrics.memoryUsageMb)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Disk</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {formatBytes(latestMetrics.diskUsageMb)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Network RX/TX</div>
                <div className="mt-1 text-xs font-semibold text-gray-900">
                  {(latestMetrics.networkRxBytes / 1024 / 1024).toFixed(2)} MB /{" "}
                  {(latestMetrics.networkTxBytes / 1024 / 1024).toFixed(2)} MB
                </div>
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
            height={200}
          />
          <MetricsChart
            data={memoryData}
            title="Memory Usage (24h)"
            color="#3b82f6"
            unit=" MB"
            maxValue={resources.memoryMb}
            height={200}
          />
          <MetricsChart
            data={diskData}
            title="Disk Usage (24h)"
            color="#10b981"
            unit=" MB"
            height={200}
          />
          <div className="space-y-2">
            <MetricsChart
              data={networkRxData}
              title="Network RX (24h)"
              color="#8b5cf6"
              unit=" MB"
              height={94}
            />
            <MetricsChart
              data={networkTxData}
              title="Network TX (24h)"
              color="#f59e0b"
              unit=" MB"
              height={94}
            />
          </div>
        </div>
      )}

      {/* Pod Logs */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Provisioning Logs
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {logs.length} log entr{logs.length !== 1 ? "ies" : "y"}
          </p>
        </div>
        {logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No logs available
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto bg-gray-900 p-4 font-mono text-xs">
            {logs.map((log) => (
              <div
                key={log.id}
                className="mb-4 border-b border-gray-700 pb-4 last:border-b-0"
              >
                {/* Log header */}
                <div className="mb-1 flex items-center gap-2 text-gray-400">
                  <span>{new Date(log.timestamp).toLocaleString()}</span>
                  <span>•</span>
                  {log.exitCode === 0 ? (
                    <CheckCircle className="h-3 w-3 text-green-400" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-400" />
                  )}
                  <span>Exit: {log.exitCode}</span>
                  <span>•</span>
                  <span>{formatDuration(log.duration)}</span>
                </div>

                {/* Label if present */}
                {log.label && (
                  <div className="mb-1 text-blue-300">{log.label}</div>
                )}

                {/* Command */}
                <div className="mb-1 text-yellow-300">
                  $ {log.containerCommand || log.command}
                </div>

                {/* Stdout */}
                {log.stdout && (
                  <div className="whitespace-pre-wrap text-gray-300">
                    {log.stdout}
                  </div>
                )}

                {/* Stderr */}
                {log.stderr && (
                  <div className="whitespace-pre-wrap text-red-400">
                    {log.stderr}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
