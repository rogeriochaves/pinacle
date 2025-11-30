"use client";

import {
  AlertTriangle,
  Eye,
  EyeOff,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import type { DotenvValidationResult } from "../../lib/dotenv";
import { api } from "../../lib/trpc/client";
import { Button } from "../ui/button";
import { DotenvEditor } from "../ui/dotenv-editor";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

type DotenvManagerProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function DotenvManager({ isOpen, onClose }: DotenvManagerProps) {
  const t = useTranslations("settings");
  const utils = api.useUtils();

  const [selectedDotenvId, setSelectedDotenvId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editName, setEditName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [validation, setValidation] = useState<DotenvValidationResult>({
    valid: true,
    errors: [],
  });

  // Fetch all dotenvs with usage info
  const {
    data: dotenvs,
    isLoading,
    refetch,
  } = api.envSets.listWithUsage.useQuery();

  // Mutations
  const updateMutation = api.envSets.update.useMutation({
    onSuccess: () => {
      toast.success(t("dotenvUpdated"));
      setIsEditing(false);
      refetch();
      utils.envSets.listWithUsage.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = api.envSets.delete.useMutation({
    onSuccess: () => {
      toast.success(t("dotenvDeleted"));
      setSelectedDotenvId(null);
      refetch();
      utils.envSets.listWithUsage.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (!isOpen) return null;

  const selectedDotenv = dotenvs?.find((d) => d.id === selectedDotenvId);

  const handleSelectDotenv = (id: string) => {
    const dotenv = dotenvs?.find((d) => d.id === id);
    if (dotenv) {
      setSelectedDotenvId(id);
      setEditContent(dotenv.content);
      setEditName(dotenv.name);
      setIsEditing(false);
      setShowContent(false);
    }
  };

  const handleSave = () => {
    if (!selectedDotenvId || !validation.valid) return;

    updateMutation.mutate({
      id: selectedDotenvId,
      name: editName,
      content: editContent,
    });
  };

  const handleDelete = () => {
    if (!selectedDotenvId) return;

    if (!selectedDotenv?.canDelete) {
      toast.error(t("cannotDeleteActiveDotenv"));
      return;
    }

    if (confirm(t("confirmDeleteDotenv"))) {
      deleteMutation.mutate({ id: selectedDotenvId });
    }
  };

  const activePodCount =
    selectedDotenv?.pods.filter((p) => !p.isArchived).length || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dotenv-manager-title"
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Modal content click handler */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation is intentional */}
      <div
        className="relative w-full max-w-4xl max-h-[85vh] bg-white rounded-lg shadow-2xl flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left sidebar - list of dotenvs */}
        <div className="w-64 border-r border-slate-200 flex flex-col bg-slate-50">
          <div className="p-4 border-b border-slate-200">
            <h2 id="dotenv-manager-title" className="text-lg font-semibold font-mono">
              {t("savedEnvVars")}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {dotenvs?.length || 0} {t("savedConfigurations")}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : dotenvs?.length === 0 ? (
              <div className="p-4 text-sm text-slate-500 text-center">
                {t("noDotenvsSaved")}
              </div>
            ) : (
              dotenvs?.map((dotenv) => (
                <button
                  key={dotenv.id}
                  type="button"
                  onClick={() => handleSelectDotenv(dotenv.id)}
                  className={`w-full text-left p-3 border-b border-slate-100 hover:bg-slate-100 transition-colors ${
                    selectedDotenvId === dotenv.id ? "bg-slate-100" : ""
                  }`}
                >
                  <div className="font-mono text-sm font-medium truncate">
                    {dotenv.name}
                  </div>
                  {(() => {
                    const activePods = dotenv.pods.filter((p) => !p.isArchived);
                    return activePods.length > 0 ? (
                      <>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {activePods.length} {t("pods")} •{" "}
                          {new Date(dotenv.updatedAt).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-xs text-green-600">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                          {t("inUse")}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-slate-500 mt-0.5">
                        {new Date(dotenv.updatedAt).toLocaleDateString()}
                      </div>
                    );
                  })()}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right panel - detail view */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              {selectedDotenv ? (
                isEditing ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-lg font-semibold font-mono bg-transparent border-b border-orange-500 focus:outline-none"
                  />
                ) : (
                  <h3 className="text-lg font-semibold font-mono">
                    {selectedDotenv.name}
                  </h3>
                )
              ) : (
                <h3 className="text-lg font-semibold font-mono text-slate-400">
                  {t("selectDotenv")}
                </h3>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedDotenv &&
                (isEditing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsEditing(false);
                        setEditContent(selectedDotenv.content);
                        setEditName(selectedDotenv.name);
                      }}
                    >
                      {t("cancel")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={updateMutation.isPending || !validation.valid}
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      <Save className="h-4 w-4 mr-1" />
                      {t("save")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowContent(!showContent)}
                    >
                      {showContent ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleDelete}
                              disabled={
                                !selectedDotenv.canDelete ||
                                deleteMutation.isPending
                              }
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {!selectedDotenv.canDelete && (
                          <TooltipContent>
                            <p className="text-xs">
                              {t("deleteDisabledTooltip")}
                            </p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </>
                ))}
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {selectedDotenv ? (
              <div className="space-y-4">
                {/* Warning for active pods */}
                {activePodCount > 0 && isEditing && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-800">
                        {t("activePodWarning")}
                      </p>
                      <p className="text-amber-700">
                        {t("activePodWarningDetail", { count: activePodCount })}
                      </p>
                    </div>
                  </div>
                )}

                {/* Pods using this dotenv (only show active/non-archived) */}
                {activePodCount > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-mono font-medium text-slate-600">
                      {t("usedByPods")}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedDotenv.pods
                        .filter((pod) => !pod.isArchived)
                        .map((pod) => (
                          <div
                            key={pod.id}
                            className="px-2 py-1 rounded text-xs font-mono bg-green-100 text-green-700"
                          >
                            {pod.name}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Editor */}
                {isEditing || showContent ? (
                  <DotenvEditor
                    value={editContent}
                    onChange={setEditContent}
                    onValidationChange={setValidation}
                    variant="light"
                    readOnly={!isEditing}
                    onEditRequest={() => setIsEditing(true)}
                  />
                ) : (
                  <div className="bg-slate-100 rounded-lg p-8 text-center">
                    <EyeOff className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 font-mono">
                      {t("contentHidden")}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowContent(true)}
                      className="mt-2"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      {t("showContent")}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <p className="font-mono">{t("selectDotenvToView")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
