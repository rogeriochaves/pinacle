"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { DotenvValidationResult } from "../../lib/dotenv";
import { api } from "../../lib/trpc/client";
import { Button } from "../ui/button";
import { DotenvEditor } from "../ui/dotenv-editor";

type EnvEditorProps = {
  podId: string;
  podStatus: string;
  isOpen: boolean;
  onClose: () => void;
};

const DEFAULT_CONTENT = `# Environment Variables
# Add your environment variables below

`;

export const EnvEditor = ({
  podId,
  podStatus,
  isOpen,
  onClose,
}: EnvEditorProps) => {
  const t = useTranslations("setup");
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [validation, setValidation] = useState<DotenvValidationResult>({
    valid: true,
    errors: [],
  });
  const utils = api.useUtils();

  // Fetch .env content
  const { data: envData, refetch: refetchEnv } =
    api.pods.getEnvFileContent.useQuery(
      { podId },
      {
        enabled: isOpen && podStatus === "running",
        refetchOnWindowFocus: false,
      },
    );

  // Poll for sync status
  const { data: syncStatus } = api.pods.getEnvSyncStatus.useQuery(
    { podId },
    {
      enabled: isOpen && podStatus === "running",
      refetchInterval: 10000,
      refetchOnWindowFocus: true,
    },
  );

  // Update env mutation
  const updateEnvMutation = api.pods.updateEnvFile.useMutation();
  const syncFromContainerMutation = api.pods.syncEnvFromContainer.useMutation();

  // Initialize content from fetched data
  useEffect(() => {
    if (envData?.content && !hasUnsavedChanges) {
      setContent(envData.content);
    }
  }, [envData, hasUnsavedChanges]);

  // Auto-sync when changes detected in container (if no unsaved local changes)
  useEffect(() => {
    const autoSync = async () => {
      if (syncStatus?.needsSync && !hasUnsavedChanges && !isSyncing) {
        setIsSyncing(true);
        try {
          const result = await syncFromContainerMutation.mutateAsync({ podId });
          setContent(result.content);
          utils.pods.getEnvSyncStatus.invalidate({ podId });
        } catch (error) {
          console.error("Auto-sync failed:", error);
        } finally {
          setIsSyncing(false);
        }
      }
    };
    autoSync();
  }, [syncStatus?.needsSync, hasUnsavedChanges, isSyncing, podId, syncFromContainerMutation, utils.pods.getEnvSyncStatus]);

  const handleContentChange = (value: string) => {
    setContent(value);
    setHasUnsavedChanges(value !== envData?.content);
  };

  const handleSave = async () => {
    // Validate before saving
    if (!validation.valid) {
      const firstError = validation.errors[0];
      toast.error(`Line ${firstError.line}: ${firstError.message}`);
      return;
    }

    setIsSyncing(true);
    try {
      await updateEnvMutation.mutateAsync({
        podId,
        content,
      });
      setHasUnsavedChanges(false);
      toast.success(t("envVarsSaved"));
      await refetchEnv();
      utils.pods.getEnvSyncStatus.invalidate({ podId });
    } catch (error) {
      toast.error(t("failedToSaveEnvVars"));
      console.error(error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullFromContainer = async () => {
    setIsSyncing(true);
    try {
      const result = await syncFromContainerMutation.mutateAsync({ podId });
      setContent(result.content);
      setHasUnsavedChanges(false);
      toast.success(t("pulledLatestEnv"));
      utils.pods.getEnvSyncStatus.invalidate({ podId });
    } catch (error) {
      toast.error(t("failedToPullEnv"));
      console.error(error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefresh = async () => {
    setIsSyncing(true);
    try {
      await refetchEnv();
      if (envData?.content) {
        setContent(envData.content);
        setHasUnsavedChanges(false);
      }
      toast.success(t("refreshedEnvContent"));
    } catch (error) {
      toast.error(t("failedToRefresh"));
      console.error(error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Count env vars
  const envVarCount = content.split("\n").filter((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith("#") && trimmed.includes("=");
  }).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default border-0"
        onClick={onClose}
        aria-label={t("closeEnvEditor")}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[80vh] bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white font-mono">
              {t("environmentVariables")}
            </h2>
            {envVarCount > 0 && (
              <span className="text-xs text-neutral-400 font-mono">
                {envVarCount}{" "}
                {envVarCount === 1 ? t("variable") : t("variables")}
              </span>
            )}
            {isSyncing && (
              <span className="flex items-center gap-1 text-xs text-neutral-400 font-mono">
                <RefreshCw className="w-3 h-3 animate-spin" />
                {t("syncing")}
              </span>
            )}
            {hasUnsavedChanges && (
              <span className="text-xs text-yellow-400 font-mono">
                • {t("unsavedChanges")}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-800">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isSyncing}
            className="text-neutral-300 hover:text-white"
          >
            <RefreshCw
              className={`w-4 h-4 mr-1 ${isSyncing ? "animate-spin" : ""}`}
            />
            {t("refresh")}
          </Button>

          {podStatus === "running" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePullFromContainer}
                disabled={isSyncing || hasUnsavedChanges}
                className="text-neutral-300 hover:text-white"
              >
                <ArrowDownToLine className="w-4 h-4 mr-1" />
                {t("pullFromContainer")}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleSave}
                disabled={isSyncing || !hasUnsavedChanges || !validation.valid}
                className="text-neutral-300 hover:text-white"
              >
                <ArrowUpFromLine className="w-4 h-4 mr-1" />
                {t("pushToContainer")}
              </Button>
            </>
          )}

          <div className="flex-1" />

          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={isSyncing || !hasUnsavedChanges || !validation.valid}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Save className="w-4 h-4 mr-1" />
            {t("save")}
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-4">
          {podStatus !== "running" ? (
            <div className="flex items-center justify-center h-full text-neutral-500 font-mono text-sm">
              {t("startPodToEditEnv")}
            </div>
          ) : (
            <DotenvEditor
              value={content}
              onChange={handleContentChange}
              onValidationChange={setValidation}
              defaultValue={envData?.content}
              showLabel={false}
              variant="dark"
              minHeight="300px"
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-neutral-800 text-xs text-neutral-500 font-mono">
          {t("envSyncNotice")}
          {envData?.source === "container" && ` ${t("loadedFromContainer")}`}
        </div>
      </div>
    </div>
  );
};
