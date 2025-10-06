"use client";

import {
  Activity,
  Cpu,
  FileText,
  HardDrive,
  Network,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/trpc/client";
import { MetricsChart } from "../admin/metrics-chart";
import { Button } from "../ui/button";

type Pod = {
  id: string;
  name: string;
  status: string;
  description?: string | null;
  cpuCores: number;
  memoryMb: number;
  storageMb: number;
  publicUrl?: string | null;
};

type PodDetailsPanelProps = {
  pod: Pod;
  onClose: () => void;
};

type TabType = "metrics" | "logs" | "settings";

const formatBytes = (mb: number) => {
  return `${mb.toFixed(0)} MB`;
};

export const PodDetailsPanel = ({ pod, onClose }: PodDetailsPanelProps) => {
  const [activeTab, setActiveTab] = useState<TabType>("metrics");

  // Fetch metrics (non-admin endpoint - we need to create this)
  // For now, using the pod.getUserPodMetrics query
  const { data: metrics } = api.pods.getMetrics.useQuery(
    { podId: pod.id },
    { enabled: pod.status === "running", refetchInterval: 5000 },
  );

  const { data: metricsHistory } = api.pods.getMetricsHistory.useQuery(
    { podId: pod.id, hoursAgo: 6 },
    { enabled: activeTab === "metrics" && pod.status === "running" },
  );

  const { data: logs } = api.pods.getLogs.useQuery(
    { podId: pod.id, lines: 100 },
    { enabled: activeTab === "logs" },
  );

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
    <>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
        aria-label="Close pod details"
      />

      {/* Slide-over panel from right */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 border-b border-slate-800 p-4 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-mono text-lg font-bold">
              {pod.name}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            {[
              { id: "metrics" as const, label: "Metrics", icon: Activity },
              { id: "logs" as const, label: "Logs", icon: FileText },
              {
                id: "settings" as const,
                label: "Settings",
                icon: SettingsIcon,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm transition-all
                    ${
                      activeTab === tab.id
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "metrics" && (
            <div className="space-y-6">
              {/* Current Stats */}
              {metrics && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="w-4 h-4 text-slate-600" />
                      <span className="font-mono text-xs text-slate-600">
                        CPU Usage
                      </span>
                    </div>
                    <p className="text-2xl font-mono font-bold text-slate-900">
                      {metrics.cpuUsagePercent.toFixed(1)}%
                    </p>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
                      <div
                        className="h-2 rounded-full bg-orange-500"
                        style={{
                          width: `${Math.min(metrics.cpuUsagePercent, 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive className="w-4 h-4 text-slate-600" />
                      <span className="font-mono text-xs text-slate-600">
                        Memory
                      </span>
                    </div>
                    <p className="text-2xl font-mono font-bold text-slate-900">
                      {formatBytes(metrics.memoryUsageMb)}
                    </p>
                    <p className="text-xs text-slate-600 font-mono mt-1">
                      of {formatBytes(pod.memoryMb)}
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive className="w-4 h-4 text-slate-600" />
                      <span className="font-mono text-xs text-slate-600">
                        Disk
                      </span>
                    </div>
                    <p className="text-2xl font-mono font-bold text-slate-900">
                      {formatBytes(metrics.diskUsageMb)}
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Network className="w-4 h-4 text-slate-600" />
                      <span className="font-mono text-xs text-slate-600">
                        Network
                      </span>
                    </div>
                    <p className="text-xs font-mono text-slate-900">
                      ↓ {formatBytes(metrics.networkRxBytes / 1024 / 1024)}
                    </p>
                    <p className="text-xs font-mono text-slate-900 mt-1">
                      ↑ {formatBytes(metrics.networkTxBytes / 1024 / 1024)}
                    </p>
                  </div>
                </div>
              )}

              {/* Historical Charts */}
              {metricsHistory && metricsHistory.length > 0 ? (
                <div className="space-y-4">
                  <h3 className="font-mono font-bold text-slate-900 text-sm">
                    Last 6 Hours
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <MetricsChart
                      data={cpuData}
                      title="CPU Usage"
                      color="#f59e0b"
                      unit="%"
                      maxValue={100}
                    />
                    <MetricsChart
                      data={memoryData}
                      title="Memory Usage"
                      color="#3b82f6"
                      unit=" MB"
                      maxValue={pod.memoryMb}
                    />
                    <MetricsChart
                      data={diskData}
                      title="Disk Usage"
                      color="#10b981"
                      unit=" MB"
                    />
                    <div className="space-y-2">
                      <MetricsChart
                        data={networkRxData}
                        title="Network RX"
                        color="#8b5cf6"
                        unit=" MB"
                        height={100}
                      />
                      <MetricsChart
                        data={networkTxData}
                        title="Network TX"
                        color="#f59e0b"
                        unit=" MB"
                        height={100}
                      />
                    </div>
                  </div>
                </div>
              ) : pod.status !== "running" ? (
                <div className="text-center py-12">
                  <p className="text-slate-600 font-mono text-sm">
                    Pod must be running to see metrics
                  </p>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-slate-600 font-mono text-sm">
                    Loading metrics...
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "logs" && (
            <div className="space-y-4">
              <h3 className="font-mono font-bold text-slate-900 text-sm">
                Recent Logs (Last 100 lines)
              </h3>
              {logs && logs.length > 0 ? (
                <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-slate-300 overflow-x-auto">
                  {logs.map((log) => (
                    <div key={log} className="mb-1">
                      {log}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-slate-600 font-mono text-sm">
                    No logs available
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-mono font-bold text-slate-900 text-sm mb-2">
                  Pod Information
                </h3>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2 font-mono text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Pod ID:</span>
                    <span className="text-slate-900 font-bold">{pod.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Status:</span>
                    <span className="text-slate-900 font-bold">
                      {pod.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">CPU:</span>
                    <span className="text-slate-900 font-bold">
                      {pod.cpuCores} vCPU
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Memory:</span>
                    <span className="text-slate-900 font-bold">
                      {Math.round(pod.memoryMb / 1024)}GB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Storage:</span>
                    <span className="text-slate-900 font-bold">
                      {Math.round(pod.storageMb / 1024)}GB
                    </span>
                  </div>
                  {pod.publicUrl && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">URL:</span>
                      <a
                        href={pod.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-600 hover:text-orange-700 font-bold truncate max-w-[200px]"
                      >
                        {pod.publicUrl}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-mono font-bold text-slate-900 text-sm mb-2">
                  Danger Zone
                </h3>
                <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                  <p className="text-sm text-red-800 mb-4">
                    Deleting a pod is permanent and cannot be undone.
                  </p>
                  <Button
                    variant="destructive"
                    className="w-full font-mono font-bold"
                  >
                    Delete Pod
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
