"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  getResourcesFromTier,
  podRecordToPinacleConfig,
} from "@/lib/pod-orchestration/pinacle-config";
import type { RouterOutputs } from "@/lib/trpc/client";
import { api } from "@/lib/trpc/client";
import { MetricsChart } from "./metrics-chart";

type PodWithDetails = RouterOutputs["admin"]["getPodsOnServer"][number];

const formatBytes = (mb: number): string => {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb.toFixed(0)} MB`;
};

export const PodRow = ({ pod }: { pod: PodWithDetails }) => {
  const [expanded, setExpanded] = useState(false);
  const { data: metricsHistory } = api.admin.getPodMetricsHistory.useQuery(
    { podId: pod.id, hoursAgo: 6 },
    { enabled: expanded },
  );

  // Parse pod config to get tier and resources
  const podConfig = podRecordToPinacleConfig({
    config: pod.config,
    name: pod.name,
  });
  const resources = getResourcesFromTier(podConfig.tier);

  const metrics = pod.latestMetrics;
  const cpuPercent = metrics?.cpuUsagePercent || 0;

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
      value: m.networkRxBytes / 1024 / 1024, // Convert to MB
    })) || [];

  const networkTxData =
    metricsHistory?.map((m) => ({
      timestamp: m.timestamp,
      value: m.networkTxBytes / 1024 / 1024, // Convert to MB
    })) || [];

  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-4 p-4 hover:bg-gray-50 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-shrink-0 text-gray-400 hover:text-gray-600">
          {expanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-gray-900 truncate">
              {pod.name}
            </h4>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
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
          <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
            <span>Tier: {podConfig.tier}</span>
            <span>•</span>
            <span>
              Owner:{" "}
              <Link
                href={`/admin/users/${pod.owner?.id}`}
                className="text-blue-600 hover:text-blue-700"
                onClick={(e) => e.stopPropagation()}
              >
                {pod.owner?.name || pod.owner?.email}
              </Link>
            </span>
            <span>•</span>
            <span>
              Team:{" "}
              <Link
                href={`/admin/teams/${pod.team?.id}`}
                className="text-blue-600 hover:text-blue-700"
                onClick={(e) => e.stopPropagation()}
              >
                {pod.team?.name}
              </Link>
            </span>
          </div>
        </div>

        {metrics && (
          <div className="flex gap-6 text-xs">
            <div>
              <span className="text-gray-500">CPU:</span>
              <span className="ml-1 font-medium text-gray-900">
                {cpuPercent.toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-gray-500">Memory:</span>
              <span className="ml-1 font-medium text-gray-900">
                {formatBytes(metrics.memoryUsageMb)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Disk:</span>
              <span className="ml-1 font-medium text-gray-900">
                {formatBytes(metrics.diskUsageMb)}
              </span>
            </div>
          </div>
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="grid flex-1 grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Pod ID:</span>
                <span className="ml-2 font-mono text-xs text-gray-900">
                  {pod.id}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Container ID:</span>
                <span className="ml-2 font-mono text-xs text-gray-900">
                  {pod.containerId || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Created:</span>
                <span className="ml-2 text-gray-900">
                  {new Date(pod.createdAt).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Public URL:</span>
                <span className="ml-2 text-gray-900">
                  {pod.publicUrl || "N/A"}
                </span>
              </div>
            </div>
            <Link
              href={`/admin/pods/${pod.id}`}
              className="ml-4 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              onClick={(e) => e.stopPropagation()}
            >
              View Details
            </Link>
          </div>

          {metricsHistory && metricsHistory.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <MetricsChart
                data={cpuData}
                title="CPU Usage"
                color="#ef4444"
                unit="%"
                maxValue={100}
              />
              <MetricsChart
                data={memoryData}
                title="Memory Usage"
                color="#3b82f6"
                unit=" MB"
                maxValue={resources.memoryMb}
              />
              <MetricsChart
                data={diskData}
                title="Disk Usage"
                color="#10b981"
                unit=" MB"
              />
              <div>
                <MetricsChart
                  data={networkRxData}
                  title="Network RX"
                  color="#8b5cf6"
                  unit=" MB"
                  height={95}
                />
                <div className="mt-2">
                  <MetricsChart
                    data={networkTxData}
                    title="Network TX"
                    color="#f59e0b"
                    unit=" MB"
                    height={95}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              No historical metrics available
            </div>
          )}
        </div>
      )}
    </div>
  );
};
