"use client";

import {
  Activity,
  Camera,
  Clock,
  Cpu,
  FileText,
  HardDrive,
  Loader2,
  Network,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  getResourcesFromTier,
  podRecordToPinacleConfig,
} from "../../lib/pod-orchestration/pinacle-config";
import { api } from "../../lib/trpc/client";
import { MetricsChart } from "../admin/metrics-chart";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

type Pod = {
  id: string;
  name: string;
  status: string;
  description?: string | null;
  config: string;
  storageMb: number; // Temporarily keep this for the prop passing
  publicUrl?: string | null;
};

type PodDetailsPanelProps = {
  pod: Pod;
  onClose: () => void;
};

type TabType = "metrics" | "logs" | "snapshots" | "settings";

const TIME_RANGE_OPTIONS = [
  { label: "1h", value: 1 },
  { label: "3h", value: 3 },
  { label: "6h", value: 6 },
  { label: "12h", value: 12 },
] as const;

const formatBytes = (mb: number) => {
  return `${mb.toFixed(0)} MB`;
};

export const PodDetailsPanel = ({ pod, onClose }: PodDetailsPanelProps) => {
  const t = useTranslations("podDetails");
  const [activeTab, setActiveTab] = useState<TabType>("metrics");
  const [timeRange, setTimeRange] = useState(3); // Default to 3 hours for better performance
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshotDescription, setSnapshotDescription] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Parse pod config to get resources
  const podConfig = podRecordToPinacleConfig({
    config: pod.config,
    name: pod.name,
  });
  const resources = getResourcesFromTier(podConfig.tier);

  const utils = api.useUtils();

  // Fetch metrics (non-admin endpoint - we need to create this)
  // For now, using the pod.getUserPodMetrics query
  const { data: metrics } = api.pods.getMetrics.useQuery(
    { podId: pod.id },
    { enabled: pod.status === "running", refetchInterval: 10000 }, // Reduced from 5s to 10s
  );

  // biome-ignore lint/suspicious/noExplicitAny: tRPC types will update on server restart
  const { data: metricsHistory } = (api.pods as any).getMetricsAggregated.useQuery(
    { podId: pod.id, hoursAgo: timeRange },
    {
      enabled: activeTab === "metrics" && pod.status === "running",
      refetchInterval: 30000, // Refresh every 30 seconds
    },
  );

  const { data: logs } = api.pods.getLogs.useQuery(
    { podId: pod.id, lines: 100 },
    { enabled: activeTab === "logs" },
  );

  // Snapshots queries and mutations
  const { data: snapshots, isLoading: snapshotsLoading } =
    api.snapshots.list.useQuery(
      { podId: pod.id },
      {
        enabled: activeTab === "snapshots",
        refetchInterval: (query) => {
          const hasActiveSnapshot = query.state.data?.some(
            (s) => s.status === "creating" || s.status === "restoring",
          );
          return hasActiveSnapshot ? 2000 : false;
        },
      },
    );

  const createMutation = api.snapshots.create.useMutation({
    onSuccess: () => {
      toast.success(t("snapshotCreated"));
      setShowCreateDialog(false);
      setSnapshotName("");
      setSnapshotDescription("");
      utils.snapshots.list.invalidate({ podId: pod.id });
    },
    onError: (error) => {
      toast.error(t("failedCreateSnapshot"), {
        description: error.message,
      });
    },
  });

  const deleteMutation = api.snapshots.delete.useMutation({
    onSuccess: () => {
      toast.success(t("snapshotDeleted"));
      utils.snapshots.list.invalidate({ podId: pod.id });
      setDeleteConfirmId(null);
    },
    onError: (error) => {
      toast.error(t("failedDeleteSnapshot"), {
        description: error.message,
      });
    },
  });

  const restoreMutation = api.snapshots.restore.useMutation({
    onSuccess: () => {
      toast.success(t("snapshotRestored"));
      utils.snapshots.list.invalidate({ podId: pod.id });
      utils.pods.getUserPods.invalidate();
      onClose(); // Close the panel after restore
    },
    onError: (error) => {
      toast.error(t("failedRestoreSnapshot"), {
        description: error.message,
      });
    },
  });

  const handleCreateSnapshot = () => {
    if (!snapshotName.trim()) {
      toast.error(t("enterSnapshotName"));
      return;
    }

    createMutation.mutate({
      podId: pod.id,
      name: snapshotName.trim(),
      description: snapshotDescription.trim() || undefined,
    });
  };

  const handleDeleteSnapshot = (snapshotId: string) => {
    deleteMutation.mutate({ snapshotId });
  };

  const handleRestoreSnapshot = (snapshotId: string) => {
    restoreMutation.mutate({ snapshotId });
  };

  const formatSnapshotBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  // Memoize chart data transformations to prevent unnecessary recalculations
  const cpuData = useMemo(
    () =>
      metricsHistory?.map((m: {
        timestamp: Date;
        cpuUsagePercent: number;
        memoryUsageMb: number;
        diskUsageMb: number;
        networkRxBytes: number;
        networkTxBytes: number;
      }) => ({
        timestamp: m.timestamp,
        value: m.cpuUsagePercent,
      })) || [],
    [metricsHistory],
  );

  const memoryData = useMemo(
    () =>
      metricsHistory?.map((m: {
        timestamp: Date;
        cpuUsagePercent: number;
        memoryUsageMb: number;
        diskUsageMb: number;
        networkRxBytes: number;
        networkTxBytes: number;
      }) => ({
        timestamp: m.timestamp,
        value: m.memoryUsageMb,
      })) || [],
    [metricsHistory],
  );

  const diskData = useMemo(
    () =>
      metricsHistory?.map((m: {
        timestamp: Date;
        cpuUsagePercent: number;
        memoryUsageMb: number;
        diskUsageMb: number;
        networkRxBytes: number;
        networkTxBytes: number;
      }) => ({
        timestamp: m.timestamp,
        value: m.diskUsageMb,
      })) || [],
    [metricsHistory],
  );

  const networkRxData = useMemo(
    () =>
      metricsHistory?.map((m: {
        timestamp: Date;
        cpuUsagePercent: number;
        memoryUsageMb: number;
        diskUsageMb: number;
        networkRxBytes: number;
        networkTxBytes: number;
      }) => ({
        timestamp: m.timestamp,
        value: m.networkRxBytes / 1024 / 1024,
      })) || [],
    [metricsHistory],
  );

  const networkTxData = useMemo(
    () =>
      metricsHistory?.map((m: {
        timestamp: Date;
        cpuUsagePercent: number;
        memoryUsageMb: number;
        diskUsageMb: number;
        networkRxBytes: number;
        networkTxBytes: number;
      }) => ({
        timestamp: m.timestamp,
        value: m.networkTxBytes / 1024 / 1024,
      })) || [],
    [metricsHistory],
  );

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
              { id: "metrics" as const, label: t("metrics"), icon: Activity },
              { id: "logs" as const, label: t("logs"), icon: FileText },
              { id: "snapshots" as const, label: t("snapshots"), icon: Camera },
              {
                id: "settings" as const,
                label: t("settings"),
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
                        {t("cpuUsage")}
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
                        {t("memory")}
                      </span>
                    </div>
                    <p className="text-2xl font-mono font-bold text-slate-900">
                      {formatBytes(metrics.memoryUsageMb)}
                    </p>
                    <p className="text-xs text-slate-600 font-mono mt-1">
                      of {formatBytes(resources.memoryMb)}
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive className="w-4 h-4 text-slate-600" />
                      <span className="font-mono text-xs text-slate-600">
                        {t("disk")}
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
                        {t("network")}
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
                  {/* Time Range Selector */}
                  <div className="flex items-center justify-between">
                    <h3 className="font-mono font-bold text-slate-900 text-sm">
                      {t("historicalMetrics")}
                    </h3>
                    <div className="flex gap-1">
                      {TIME_RANGE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setTimeRange(option.value)}
                          className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                            timeRange === option.value
                              ? "bg-orange-500 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
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
                      maxValue={resources.memoryMb}
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
                    {t("podMustBeRunning")}
                  </p>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-slate-600 font-mono text-sm">
                    {t("loadingMetrics")}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "logs" && (
            <div className="space-y-4">
              <h3 className="font-mono font-bold text-slate-900 text-sm">
                {t("recentLogs")}
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
                    {t("noLogsAvailable")}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "snapshots" && (
            <div className="space-y-4">
              {/* Create Snapshot Button */}
              <div>
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  disabled={
                    pod.status !== "running" || createMutation.isPending
                  }
                  className="font-mono"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("creating")}
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4 mr-2" />
                      {t("createSnapshot")}
                    </>
                  )}
                </Button>
                {pod.status !== "running" && (
                  <p className="text-sm text-slate-600 mt-2 font-mono">
                    {t("podMustBeRunning")}
                  </p>
                )}
              </div>

              {/* Snapshots List */}
              {snapshotsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : snapshots && snapshots.length > 0 ? (
                <div className="space-y-3">
                  {snapshots.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className="border border-slate-200 rounded-lg p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-mono font-semibold text-slate-900">
                              {snapshot.name}
                            </h3>
                            {snapshot.isAuto && (
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-mono">
                                {t("auto")}
                              </span>
                            )}
                            {snapshot.status === "creating" && (
                              <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded font-mono flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                {t("creatingStatus")}
                              </span>
                            )}
                            {snapshot.status === "failed" && (
                              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded font-mono">
                                {t("failed")}
                              </span>
                            )}
                          </div>
                          {snapshot.description && (
                            <p className="text-sm text-slate-600 font-mono mt-1">
                              {snapshot.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 font-mono">
                            <span className="flex items-center gap-1">
                              <Save className="w-3 h-3" />
                              {formatSnapshotBytes(snapshot.sizeBytes)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(snapshot.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleRestoreSnapshot(snapshot.id)}
                            disabled={
                              restoreMutation.isPending ||
                              snapshot.status !== "ready"
                            }
                            className="text-slate-400 hover:text-blue-600 transition-colors p-2 rounded hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={t("restoreFromSnapshot")}
                          >
                            {restoreMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RotateCcw className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(snapshot.id)}
                            disabled={deleteMutation.isPending}
                            className="text-slate-400 hover:text-red-600 transition-colors p-2 rounded hover:bg-red-50"
                            title={t("deleteSnapshot")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {snapshot.errorMessage && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                          <p className="text-xs text-red-700 font-mono">
                            {snapshot.errorMessage}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Camera className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 font-mono text-sm mb-2">
                    {t("noSnapshotsYet")}
                  </p>
                  <p className="text-slate-400 font-mono text-xs">
                    {t("autoSnapshotsNote")}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-mono font-bold text-slate-900 text-sm mb-2">
                  {t("dangerZone")}
                </h3>
                <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                  <p className="text-sm text-red-800 mb-4">
                    {t("deletePodWarning")}
                  </p>
                  <Button
                    variant="destructive"
                    className="w-full font-mono font-bold"
                  >
                    {t("deletePod")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Snapshot Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="font-mono font-bold text-lg mb-4">
              {t("createSnapshot")}
            </h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="snapshot-name" className="font-mono">
                  {t("snapshotName")} *
                </Label>
                <Input
                  id="snapshot-name"
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                  placeholder="e.g. before-deployment"
                  className="font-mono"
                />
              </div>
              <div>
                <Label htmlFor="snapshot-description" className="font-mono">
                  {t("descriptionOptional")}
                </Label>
                <Textarea
                  id="snapshot-description"
                  value={snapshotDescription}
                  onChange={(e) => setSnapshotDescription(e.target.value)}
                  placeholder={t("snapshotDescriptionPlaceholder")}
                  className="font-mono"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setSnapshotName("");
                    setSnapshotDescription("");
                  }}
                  className="flex-1 font-mono"
                >
                  {t("cancel")}
                </Button>
                <Button
                  onClick={handleCreateSnapshot}
                  disabled={createMutation.isPending}
                  className="flex-1 font-mono"
                >
                  {createMutation.isPending ? t("creating") : t("create")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={() => setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">
              {t("deleteSnapshot")}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono">
              {t("deleteSnapshotConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteConfirmId && handleDeleteSnapshot(deleteConfirmId)
              }
              className="bg-red-500 hover:bg-red-600 font-mono"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
