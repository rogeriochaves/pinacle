"use client";

import { Loader2, Server } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PodDetailsPanel } from "../../components/dashboard/pod-details-panel";
import { PodSelector } from "../../components/dashboard/pod-selector";
import { Workbench } from "../../components/dashboard/workbench";
import { Button } from "../../components/ui/button";
import { api } from "../../lib/trpc/client";

export default function Dashboard() {
  const [showPodSelector, setShowPodSelector] = useState(false);
  const [showPodDetails, setShowPodDetails] = useState(false);
  const [selectedPodId, setSelectedPodId] = useState<string | null>(null);

  const { data: pods, isLoading, refetch } = api.pods.getUserPods.useQuery();
  const startPodMutation = api.pods.start.useMutation();
  const stopPodMutation = api.pods.stop.useMutation();
  const deletePodMutation = api.pods.delete.useMutation();

  // Get the first running pod, or the first pod if none are running
  const runningPod = pods?.find((pod) => pod.status === "running");
  const activePod = selectedPodId
    ? pods?.find((p) => p.id === selectedPodId)
    : runningPod || pods?.[0];

  const handleStartPod = async (podId: string) => {
    try {
      await startPodMutation.mutateAsync({ id: podId });
      refetch();
    } catch (error) {
      console.error("Failed to start pod:", error);
    }
  };

  const handleStopPod = async (podId: string) => {
    try {
      await stopPodMutation.mutateAsync({ id: podId });
      refetch();
    } catch (error) {
      console.error("Failed to stop pod:", error);
    }
  };

  const handleDeletePod = async (podId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this pod? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      await deletePodMutation.mutateAsync({ id: podId });
      refetch();
      if (selectedPodId === podId) {
        setSelectedPodId(null);
      }
    } catch (error) {
      console.error("Failed to delete pod:", error);
    }
  };

  const handleSelectPod = (podId: string) => {
    setSelectedPodId(podId);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
          <p className="text-white font-mono text-lg font-bold">
            Loading your workspace...
          </p>
        </div>
      </div>
    );
  }

  // No pods - show empty state
  if (!pods || pods.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-6">
            <Server className="w-8 h-8 text-slate-600" />
          </div>
          <h1 className="text-white font-mono text-2xl font-bold mb-2">
            No Pods Yet
          </h1>
          <p className="text-slate-400 font-mono text-sm mb-8">
            Create your first development environment to get started
          </p>
          <Button
            asChild
            size="lg"
            className="bg-orange-500 hover:bg-orange-600 text-white font-mono font-bold"
          >
            <Link href="/setup">Create Your First Pod</Link>
          </Button>
        </div>
      </div>
    );
  }

  // No active pod (shouldn't happen, but just in case)
  if (!activePod) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white font-mono">No active pod</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Workbench
        pod={activePod}
        onPodSwitch={() => setShowPodSelector(true)}
      />

      {showPodSelector && pods && (
        <PodSelector
          pods={pods}
          currentPodId={activePod.id}
          onSelect={handleSelectPod}
          onClose={() => setShowPodSelector(false)}
          onStartPod={handleStartPod}
          onStopPod={handleStopPod}
          onDeletePod={handleDeletePod}
          onViewDetails={(podId) => {
            setSelectedPodId(podId);
            setShowPodSelector(false);
            setShowPodDetails(true);
          }}
        />
      )}

      {showPodDetails && (
        <PodDetailsPanel
          pod={{
            ...activePod,
            storageMb: 10240, // TODO: Add storageMb to getUserPods query
          }}
          onClose={() => setShowPodDetails(false)}
        />
      )}
    </>
  );
}
