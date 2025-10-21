"use client";

import {
  ExternalLink,
  Loader2,
  Play,
  Plus,
  Settings,
  Square,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  getResourcesFromTier,
  podRecordToPinacleConfig,
} from "../../lib/pod-orchestration/pinacle-config";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

type Pod = {
  id: string;
  name: string;
  status: string;
  description?: string | null;
  config: string;
  publicUrl?: string | null;
};

type PodSelectorProps = {
  pods: Pod[];
  currentPodId: string;
  onSelect: (podId: string) => void;
  onClose: () => void;
  onStartPod: (podId: string) => void;
  onStopPod: (podId: string) => void;
  onDeletePod: (podId: string) => void;
  deletingPodId: string | null;
  onViewDetails: (podId: string) => void;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "running":
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <div className="w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />
          Running
        </Badge>
      );
    case "stopped":
      return (
        <Badge className="bg-gray-100 text-gray-800 border-gray-200">
          <div className="w-2 h-2 rounded-full bg-gray-500 mr-1.5" />
          Stopped
        </Badge>
      );
    case "starting":
    case "creating":
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
          <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
          Starting
        </Badge>
      );
    case "error":
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200">
          <div className="w-2 h-2 rounded-full bg-red-500 mr-1.5" />
          Error
        </Badge>
      );
    default:
      return (
        <Badge className="bg-gray-100 text-gray-800 border-gray-200">
          {status}
        </Badge>
      );
  }
};

export const PodSelector = ({
  pods,
  currentPodId,
  onSelect,
  onClose,
  onStartPod,
  onStopPod,
  onDeletePod,
  deletingPodId,
  onViewDetails,
}: PodSelectorProps) => {
  const sortedPods = [...pods].sort((a, b) => {
    // Running pods first, then by name
    if (a.status === "running" && b.status !== "running") return -1;
    if (a.status !== "running" && b.status === "running") return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
        aria-label="Close pod selector"
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 left-0 z-50 w-full max-w-md bg-slate-50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between shrink-0">
          <h2 className="text-white font-mono text-lg font-bold">Your Pods</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pod List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sortedPods.map((pod) => {
            const isCurrent = pod.id === currentPodId;
            const isRunning = pod.status === "running";
            const isDeleting = deletingPodId === pod.id;

            return (
              <div
                key={pod.id}
                className={`
                  bg-white rounded-xl p-4 border-2 transition-all
                  ${
                    isCurrent
                      ? "border-orange-500 shadow-lg"
                      : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                  }
                `}
              >
                <div className="flex items-start justify-between mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(pod.id);
                      onClose();
                    }}
                    className="flex-1 text-left"
                  >
                    <h3 className="font-mono font-bold text-slate-900 flex items-center gap-2">
                      {pod.name}
                      {isCurrent && (
                        <Badge className="bg-orange-100 text-orange-800 text-[10px] border-orange-200">
                          Current
                        </Badge>
                      )}
                    </h3>
                    {pod.description && (
                      <p className="text-sm text-slate-600 mt-1">
                        {pod.description}
                      </p>
                    )}
                  </button>
                  {getStatusBadge(pod.status)}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 font-mono mb-3">
                  <span>
                    {(() => {
                      const podConfig = podRecordToPinacleConfig({
                        config: pod.config,
                        name: pod.name,
                      });
                      const resources = getResourcesFromTier(podConfig.tier);
                      return `${resources.cpuCores} vCPU • ${Math.round(resources.memoryMb / 1024)}GB RAM`;
                    })()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isRunning ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onStopPod(pod.id)}
                        className="flex-1 font-mono text-xs"
                      >
                        <Square className="w-3 h-3 mr-1" />
                        Stop
                      </Button>
                      {pod.publicUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                          className="font-mono text-xs"
                        >
                          <Link href={pod.publicUrl} target="_blank">
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </Button>
                      )}
                    </>
                  ) : !isDeleting ? (
                    <Button
                      size="sm"
                      onClick={() => onStartPod(pod.id)}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-mono text-xs"
                    >
                      <Play className="w-3 h-3 mr-1" />
                      Start
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onViewDetails(pod.id)}
                    className="text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    title="View Details"
                  >
                    <Settings className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDeletePod(pod.id)}
                    disabled={isDeleting}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })}

          {sortedPods.length === 0 && (
            <div className="text-center py-12">
              <p className="text-slate-600 font-mono text-sm mb-4">
                No pods yet
              </p>
              <Button
                asChild
                className="bg-orange-500 hover:bg-orange-600 text-white font-mono"
              >
                <Link href="/setup">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Pod
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        {sortedPods.length > 0 && (
          <div className="border-t border-slate-200 p-4 shrink-0">
            <Button
              asChild
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-mono font-bold"
            >
              <Link href="/setup">
                <Plus className="w-4 h-4 mr-2" />
                Create New Pod
              </Link>
            </Button>
          </div>
        )}
      </div>
    </>
  );
};
