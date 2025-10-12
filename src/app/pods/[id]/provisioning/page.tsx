"use client";

import { AlertCircle, ArrowLeft, CheckCircle, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/trpc/client";

type PodStatus = "creating" | "provisioning" | "running" | "stopped" | "error";

const StatusBadge = ({ status }: { status: PodStatus }) => {
  const statusConfig = {
    creating: {
      icon: Loader2,
      text: "Creating",
      bgColor: "bg-blue-500/10",
      textColor: "text-blue-400",
      iconClass: "animate-spin",
    },
    provisioning: {
      icon: Loader2,
      text: "Provisioning",
      bgColor: "bg-orange-500/10",
      textColor: "text-orange-400",
      iconClass: "animate-spin",
    },
    running: {
      icon: CheckCircle,
      text: "Running",
      bgColor: "bg-green-500/10",
      textColor: "text-green-400",
      iconClass: "",
    },
    stopped: {
      icon: XCircle,
      text: "Stopped",
      bgColor: "bg-gray-500/10",
      textColor: "text-gray-400",
      iconClass: "",
    },
    error: {
      icon: XCircle,
      text: "Error",
      bgColor: "bg-red-500/10",
      textColor: "text-red-400",
      iconClass: "",
    },
  };

  const config = statusConfig[status] || statusConfig.creating;
  const Icon = config.icon;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-mono text-sm font-bold ${config.bgColor} ${config.textColor}`}
    >
      <Icon className={`h-4 w-4 ${config.iconClass}`} />
      {config.text}
    </div>
  );
};

export default function PodProvisioningPage() {
  const params = useParams();
  const router = useRouter();
  const podId = params?.id as string;

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const [lastLogId, setLastLogId] = useState<string | undefined>();
  const [allLogs, setAllLogs] = useState<
    Array<{
      id: string;
      timestamp: Date;
      label: string | null;
      stdout: string | null;
      stderr: string | null;
      exitCode: number | null;
    }>
  >([]);

  // Poll status and logs every 2 seconds
  const { data, isLoading, error } = api.pods.getStatusWithLogs.useQuery(
    { podId, lastLogId },
    {
      refetchInterval: 2000,
      enabled: !!podId,
    },
  );

  const retryProvisioningMutation = api.pods.retryProvisioning.useMutation();

  // Accumulate logs as they come in
  useEffect(() => {
    if (data?.logs && data.logs.length > 0) {
      setAllLogs((prev) => {
        // Merge new logs, avoiding duplicates by ID
        const existingIds = new Set(prev.map((log) => log.id));
        const newLogs = data.logs.filter((log) => !existingIds.has(log.id));
        return [...prev, ...newLogs];
      });

      // Update lastLogId to fetch incrementally next time
      const lastLog = data.logs[data.logs.length - 1];
      if (lastLog) {
        setLastLogId(lastLog.id);
      }
    }
  }, [data?.logs]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (consoleEndRef.current && allLogs.length > 0) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [allLogs.length]);

  // Auto-redirect to dashboard when status becomes "running"
  useEffect(() => {
    if (data?.pod.status === "running") {
      // Wait 2 seconds to show success, then redirect
      const timer = setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [data?.pod.status, router]);

  // Detect stale provisioning (last log >10 min old)
  const isStaleProvisioning = (): boolean => {
    if (!data?.pod || data.pod.status !== "creating") return false;
    if (allLogs.length === 0) return false;

    const lastLog = allLogs[allLogs.length - 1];
    const lastLogTime = new Date(lastLog.timestamp).getTime();
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;

    return now - lastLogTime > tenMinutes;
  };

  const handleRetry = async () => {
    try {
      await retryProvisioningMutation.mutateAsync({ podId });
      // Reset logs and lastLogId to start fresh
      setAllLogs([]);
      setLastLogId(undefined);
    } catch (error) {
      console.error("Failed to retry provisioning:", error);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
          <p className="text-white font-mono text-lg font-bold">
            Loading pod status...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-white font-mono text-2xl font-bold mb-2">
            Pod Not Found
          </h1>
          <p className="text-slate-400 font-mono text-sm mb-8">
            {error?.message || "Unable to load pod details"}
          </p>
          <Button
            asChild
            className="bg-orange-500 hover:bg-orange-600 text-white font-mono font-bold"
          >
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const { pod } = data;
  const showRetryButton = pod.status === "error" || isStaleProvisioning();

  return (
    <div className="min-h-screen bg-slate-900 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <h1 className="text-white font-mono text-2xl font-bold">
                {pod.name}
              </h1>
              <StatusBadge status={pod.status as PodStatus} />
            </div>
            <p className="text-slate-400 font-mono text-sm">
              Setting up your development environment...
            </p>
          </div>
          <Button
            asChild
            variant="ghost"
            className="text-slate-400 hover:text-white font-mono"
          >
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        </div>

        {/* Stale provisioning warning */}
        {isStaleProvisioning() && (
          <div className="mb-6 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-yellow-400 font-mono font-bold text-sm mb-1">
                  Provisioning May Have Stalled
                </h3>
                <p className="text-yellow-400/80 font-mono text-xs">
                  No updates for over 10 minutes. The provisioning process may have
                  encountered an issue. You can retry provisioning below.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Retry button */}
        {showRetryButton && (
          <div className="mb-6">
            <Button
              onClick={handleRetry}
              disabled={retryProvisioningMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white font-mono font-bold"
            >
              {retryProvisioningMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                "Retry Provisioning"
              )}
            </Button>
          </div>
        )}

        {/* Console Logs */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
          <div className="border-b border-slate-700 px-4 py-3 bg-slate-800/50">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-mono font-semibold text-sm">
                Provisioning Console
              </h2>
              <span className="text-slate-400 font-mono text-xs">
                {allLogs.length} log entr{allLogs.length !== 1 ? "ies" : "y"}
              </span>
            </div>
          </div>

          {allLogs.length === 0 ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 text-slate-600 animate-spin mx-auto mb-3" />
              <p className="text-slate-500 font-mono text-sm">
                Waiting for logs...
              </p>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto bg-slate-900 p-4 font-mono text-xs">
              {allLogs.map((log) => (
                <div
                  key={log.id}
                  className="mb-4 border-b border-slate-700 pb-4 last:border-b-0"
                >
                  {/* Log header */}
                  <div className="mb-1 flex items-center gap-2 text-slate-500">
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span>•</span>
                    {log.exitCode === 0 ? (
                      <CheckCircle className="h-3 w-3 text-green-400" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-400" />
                    )}
                    <span>Exit: {log.exitCode}</span>
                  </div>

                  {/* Label if present */}
                  {log.label && (
                    <div className="mb-1 text-blue-400">{log.label}</div>
                  )}

                  {/* Stdout */}
                  {log.stdout && (
                    <div className="whitespace-pre-wrap text-slate-300">
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
              {/* Auto-scroll anchor */}
              <div ref={consoleEndRef} />
            </div>
          )}
        </div>

        {/* Success message when running */}
        {pod.status === "running" && (
          <div className="mt-6 rounded-lg border border-green-500/20 bg-green-500/10 p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
              <div>
                <h3 className="text-green-400 font-mono font-bold text-sm mb-1">
                  Pod is Ready!
                </h3>
                <p className="text-green-400/80 font-mono text-xs">
                  Redirecting to dashboard in a moment...
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

