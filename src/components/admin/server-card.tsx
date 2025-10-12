"use client";

import Link from "next/link";
import { isServerOnline } from "@/lib/server-status";
import type { RouterOutputs } from "@/lib/trpc/client";

type Server = RouterOutputs["admin"]["getAllServers"][number];

const formatUptime = (lastHeartbeat: Date | null) => {
  if (!lastHeartbeat) return "Never";

  const diff = Date.now() - new Date(lastHeartbeat).getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

const formatBytes = (mb: number): string => {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb.toFixed(0)} MB`;
};

export const ServerCard = ({ server }: { server: Server }) => {
  const isOnline = isServerOnline(server.status, server.lastHeartbeatAt);
  const metrics = server.latestMetrics;

  // Calculate percentages
  const cpuPercent = metrics?.cpuUsagePercent || 0;
  const memoryPercent = metrics
    ? (metrics.memoryUsageMb / server.memoryMb) * 100
    : 0;
  const diskPercent = metrics ? (metrics.diskUsageGb / server.diskGb) * 100 : 0;

  return (
    <Link
      href={`/admin/servers/${server.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:border-gray-300 hover:shadow-md transition-all"
    >
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">
            {server.hostname}
          </h3>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isOnline
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
      </div>
      <div className="flex items-start justify-between">
        <div>
          <p className="mt-1 text-sm text-gray-500">{server.ipAddress}</p>
          <p className="mt-1 text-xs text-gray-400">
            Last heartbeat: {formatUptime(server.lastHeartbeatAt)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">
            {server.activePodsCount}
          </div>
          <div className="text-xs text-gray-500">Active Pods</div>
        </div>
      </div>

      {/* Hardware specs */}
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-100 pt-4">
        <div>
          <div className="text-xs font-medium text-gray-500">CPU Cores</div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            {server.cpuCores}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500">Memory</div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            {formatBytes(server.memoryMb)}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500">Disk</div>
          <div className="mt-1 text-sm font-semibold text-gray-900">
            {server.diskGb.toFixed(0)} GB
          </div>
        </div>
      </div>

      {/* Resource usage */}
      {metrics && (
        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          <div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">CPU</span>
              <span className="font-medium text-gray-900">
                {cpuPercent.toFixed(1)}%
              </span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
              <div
                className={`h-2 rounded-full ${
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
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Memory</span>
              <span className="font-medium text-gray-900">
                {formatBytes(metrics.memoryUsageMb)} /{" "}
                {formatBytes(server.memoryMb)}
              </span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
              <div
                className={`h-2 rounded-full ${
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
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Disk</span>
              <span className="font-medium text-gray-900">
                {metrics.diskUsageGb.toFixed(1)} GB / {server.diskGb.toFixed(0)}{" "}
                GB
              </span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
              <div
                className={`h-2 rounded-full ${
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
    </Link>
  );
};
