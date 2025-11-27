"use client";

import { Loader2, Server } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PodDetailsPanel } from "@/components/dashboard/pod-details-panel";
import { PodSelector } from "@/components/dashboard/pod-selector";
import { Workbench } from "@/components/dashboard/workbench";
import { Button } from "@/components/ui/button";
import {
  getResourcesFromTier,
  podRecordToPinacleConfig,
} from "@/lib/pod-orchestration/pinacle-config";
import { api } from "@/lib/trpc/client";

export default function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPodSelector, setShowPodSelector] = useState(false);
  const [showPodDetails, setShowPodDetails] = useState(false);
  const [selectedPodId, setSelectedPodId] = useState<string | null>(null);
  const [deletingPodId, setDeletingPodId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");

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

  // Poll for status updates when any pod is in transitional state
  useEffect(() => {
    const hasTransitionalPod = pods?.some(
      (pod) =>
        pod.status === "starting" ||
        pod.status === "stopping" ||
        pod.status === "creating" ||
        pod.status === "provisioning" ||
        pod.status === "deleting",
    );

    if (hasTransitionalPod) {
      // Start polling every 2 seconds
      pollingIntervalRef.current = setInterval(() => {
        refetch();
      }, 2000);
    } else {
      // Clear polling when no pods in transitional state
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [pods, refetch]);

  // Check for team invitation success message
  useEffect(() => {
    const teamInvitationSuccess = sessionStorage.getItem(
      "teamInvitationSuccess",
    );
    if (teamInvitationSuccess) {
      toast.success(t("welcomeToTeam"), {
        description: t("welcomeToTeamDescription"),
      });
      sessionStorage.removeItem("teamInvitationSuccess");
    }
  }, [t]);

  // Get the first running pod, or the first pod if none are running
  // Note: pods are now ordered by createdAt DESC, so pods[0] is the newest
  const runningPod = pods?.find((pod) => pod.status === "running");
  const activePod = selectedPodId
    ? pods?.find((p) => p.id === selectedPodId)
    : runningPod || pods?.[0];

  const handleStartPod = async (podId: string) => {
    const podName = pods?.find((p) => p.id === podId)?.name || "Pod";
    try {
      await startPodMutation.mutateAsync({ id: podId });
      toast.success(t("podStarting", { name: podName }), {
        description: t("podStartingDescription", { name: podName }),
      });
      refetch();
    } catch (error) {
      console.error("Failed to start pod:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(t("failedToStart", { name: podName }), {
        description: errorMessage,
      });
    }
  };

  const handleStopPod = async (podId: string) => {
    const podName = pods?.find((p) => p.id === podId)?.name || "Pod";
    try {
      await stopPodMutation.mutateAsync({ id: podId });
      toast.success(t("podStopping", { name: podName }), {
        description: t("podStoppingDescription", { name: podName }),
      });
      refetch();
    } catch (error) {
      console.error("Failed to stop pod:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(t("failedToStop", { name: podName }), {
        description: errorMessage,
      });
    }
  };

  const handleDeletePod = async (podId: string) => {
    if (!confirm(t("confirmDelete"))) {
      return;
    }

    setDeletingPodId(podId);
    const podName = pods?.find((p) => p.id === podId)?.name || "Pod";

    try {
      await deletePodMutation.mutateAsync({ id: podId });
      toast.success(t("podArchived", { name: podName }), {
        description: t("podArchivedDescription", { name: podName }),
      });
      refetch();
      if (selectedPodId === podId) {
        setSelectedPodId(null);
      }
    } catch (error) {
      console.error("Failed to delete pod:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(t("failedToDelete", { name: podName }), {
        description: errorMessage,
      });
    } finally {
      setDeletingPodId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
          <p className="text-white font-mono text-lg font-bold">
            {tCommon("loadingYourWorkspace")}
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
            {t("noPodsYet")}
          </h1>
          <p className="text-slate-400 font-mono text-sm mb-8">
            {t("noPodsDescription")}
          </p>
          <Button
            asChild
            size="lg"
            className="bg-orange-500 hover:bg-orange-600 text-white font-mono font-bold"
          >
            <Link href="/setup">{t("createFirstPod")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const podSelector = showPodSelector && pods && (
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
  );

  // No active pod selected or pod was archived
  if (!activePod) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-6">
            <Server className="w-8 h-8 text-slate-600" />
          </div>
          <h1 className="text-white font-mono text-2xl font-bold mb-2">
            {t("noActivePod")}
          </h1>
          <p className="text-slate-400 font-mono text-sm mb-8">
            {t("noActivePodDescription")}
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              size="lg"
              onClick={() => setShowPodSelector(true)}
              className="bg-slate-700 hover:bg-slate-600 text-white font-mono font-bold"
            >
              {t("selectPod")}
            </Button>
            <Button
              asChild
              size="lg"
              className="bg-orange-500 hover:bg-orange-600 text-white font-mono font-bold"
            >
              <Link href="/setup">{t("createNewPod")}</Link>
            </Button>
          </div>
        </div>
        {podSelector}
      </div>
    );
  }

  return (
    <>
      <Workbench pod={activePod} onPodSwitch={() => setShowPodSelector(true)} />

      {podSelector}

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
