"use client";

import { Loader2, Server } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PodDetailsPanel } from "../../components/dashboard/pod-details-panel";
import { PodSelector } from "../../components/dashboard/pod-selector";
import { Workbench } from "../../components/dashboard/workbench";
import { Button } from "../../components/ui/button";
import {
  getResourcesFromTier,
  podRecordToPinacleConfig,
} from "../../lib/pod-orchestration/pinacle-config";
import { api } from "../../lib/trpc/client";

export default function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPodSelector, setShowPodSelector] = useState(false);
  const [showPodDetails, setShowPodDetails] = useState(false);
  const [selectedPodId, setSelectedPodId] = useState<string | null>(null);
  const [deletingPodId, setDeletingPodId] = useState<string | null>(null);

  const { data: pods, isLoading, refetch } = api.pods.getUserPods.useQuery();
  const startPodMutation = api.pods.start.useMutation();
  const stopPodMutation = api.pods.stop.useMutation();
  const deletePodMutation = api.pods.delete.useMutation();

  // Initialize selectedPodId from URL parameter
  useEffect(() => {
    const podIdFromUrl = searchParams.get("pod");
    if (podIdFromUrl && !selectedPodId) {
      setSelectedPodId(podIdFromUrl);
    }
  }, [searchParams, selectedPodId]);

  // Get the first running pod, or the first pod if none are running
  // Note: pods are now ordered by createdAt DESC, so pods[0] is the newest
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
        "Are you sure you want to archive this pod? The container will be stopped and removed.",
      )
    ) {
      return;
    }

    setDeletingPodId(podId);
    const podName = pods?.find((p) => p.id === podId)?.name || "Pod";

    try {
      await deletePodMutation.mutateAsync({ id: podId });
      toast.success(`${podName} archived successfully`, {
        description: "The pod has been stopped and archived.",
      });
      refetch();
      if (selectedPodId === podId) {
        setSelectedPodId(null);
      }
    } catch (error) {
      console.error("Failed to delete pod:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(`Failed to archive ${podName}`, {
        description: errorMessage,
      });
    } finally {
      setDeletingPodId(null);
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

  // No active pod selected or pod was archived
  if (!activePod) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-6">
            <Server className="w-8 h-8 text-slate-600" />
          </div>
          <h1 className="text-white font-mono text-2xl font-bold mb-2">
            No Active Pod
          </h1>
          <p className="text-slate-400 font-mono text-sm mb-8">
            Select a pod from your workspace or create a new one
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              size="lg"
              onClick={() => setShowPodSelector(true)}
              className="bg-slate-700 hover:bg-slate-600 text-white font-mono font-bold"
            >
              Select Pod
            </Button>
            <Button
              asChild
              size="lg"
              className="bg-orange-500 hover:bg-orange-600 text-white font-mono font-bold"
            >
              <Link href="/setup">Create New Pod</Link>
            </Button>
          </div>
        </div>
        {showPodSelector && pods && (
          <PodSelector
            pods={pods}
            currentPodId={selectedPodId || pods[0]?.id || ""}
            onSelect={(podId) => {
              setSelectedPodId(podId);
              setShowPodSelector(false);
              // Update URL
              router.push(`/dashboard?pod=${podId}`);
            }}
            onClose={() => setShowPodSelector(false)}
            onStartPod={handleStartPod}
            onStopPod={handleStopPod}
            onDeletePod={handleDeletePod}
            deletingPodId={deletingPodId}
            onViewDetails={(podId) => {
              setSelectedPodId(podId);
              setShowPodSelector(false);
              setShowPodDetails(true);
            }}
          />
        )}
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
          deletingPodId={deletingPodId}
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
            storageMb: getResourcesFromTier(
              podRecordToPinacleConfig({
                config: activePod.config,
                name: activePod.name,
              }).tier,
            ).storageMb,
          }}
          onClose={() => setShowPodDetails(false)}
        />
      )}
    </>
  );
}
