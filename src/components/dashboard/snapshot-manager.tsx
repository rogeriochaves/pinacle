"use client";

import { Camera, Clock, Loader2, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/trpc/client";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

type SnapshotManagerProps = {
  podId: string;
  podName: string;
  podStatus: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const SnapshotManager = ({
  podId,
  podName,
  podStatus,
  open,
  onOpenChange,
}: SnapshotManagerProps) => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshotDescription, setSnapshotDescription] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const utils = api.useUtils();

  // Queries
  const { data: snapshots, isLoading: snapshotsLoading } =
    api.snapshots.list.useQuery(
      { podId },
      {
        enabled: open,
        refetchOnMount: true,
        refetchInterval: (query) => {
          // Refetch if any snapshot is in creating/restoring state
          const hasActiveSnapshot = query.state.data?.some(
            (s) => s.status === "creating" || s.status === "restoring",
          );
          return hasActiveSnapshot ? 2000 : 5000;
        },
      },
    );

  // Mutations
  const createMutation = api.snapshots.create.useMutation({
    onSuccess: () => {
      toast.success("Snapshot created successfully!");
      setShowCreateDialog(false);
      setSnapshotName("");
      setSnapshotDescription("");
      utils.snapshots.list.invalidate({ podId });
    },
    onError: (error) => {
      toast.error(`Failed to create snapshot: ${error.message}`);
    },
  });

  const deleteMutation = api.snapshots.delete.useMutation({
    onSuccess: () => {
      toast.success("Snapshot deleted successfully!");
      utils.snapshots.list.invalidate({ podId });
      setDeleteConfirmId(null);
    },
    onError: (error) => {
      toast.error(`Failed to delete snapshot: ${error.message}`);
    },
  });

  const handleCreateSnapshot = () => {
    if (!snapshotName.trim()) {
      toast.error("Please enter a snapshot name");
      return;
    }

    createMutation.mutate({
      podId,
      name: snapshotName.trim(),
      description: snapshotDescription.trim() || undefined,
    });
  };

  const handleDeleteSnapshot = (snapshotId: string) => {
    deleteMutation.mutate({ snapshotId });
  };

  const formatBytes = (bytes: number) => {
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

  const canCreateSnapshot = podStatus === "running";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono">
              Snapshots for {podName}
            </DialogTitle>
            <DialogDescription className="font-mono">
              Create and manage snapshots of your pod's filesystem
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            {/* Create Snapshot Section */}
            <div className="mb-6">
              <Button
                onClick={() => setShowCreateDialog(true)}
                disabled={!canCreateSnapshot || createMutation.isPending}
                className="font-mono"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 mr-2" />
                    Create Snapshot
                  </>
                )}
              </Button>
              {!canCreateSnapshot && (
                <p className="text-sm text-slate-400 mt-2 font-mono">
                  Pod must be running to create a snapshot
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
                    className="border border-slate-700 rounded-lg p-4 bg-slate-900/50 hover:bg-slate-900/80 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-mono font-semibold text-white">
                            {snapshot.name}
                          </h3>
                          {snapshot.isAuto && (
                            <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded font-mono">
                              auto
                            </span>
                          )}
                          {snapshot.status === "creating" && (
                            <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded font-mono flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              creating...
                            </span>
                          )}
                          {snapshot.status === "failed" && (
                            <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded font-mono">
                              failed
                            </span>
                          )}
                        </div>
                        {snapshot.description && (
                          <p className="text-sm text-slate-400 mt-1 font-mono">
                            {snapshot.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(snapshot.createdAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Save className="w-3 h-3" />
                            {formatBytes(snapshot.sizeBytes)}
                          </span>
                        </div>
                        {snapshot.errorMessage && (
                          <p className="text-xs text-red-400 mt-2 font-mono">
                            Error: {snapshot.errorMessage}
                          </p>
                        )}
                      </div>
                      {snapshot.status === "ready" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirmId(snapshot.id)}
                          disabled={deleteMutation.isPending}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 font-mono">
                <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No snapshots yet</p>
                <p className="text-sm mt-1">
                  Create a snapshot to save your pod's current state
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Snapshot Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-mono">Create Snapshot</DialogTitle>
            <DialogDescription className="font-mono">
              Save the current state of your pod
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name" className="font-mono">
                Snapshot Name
              </Label>
              <Input
                id="name"
                placeholder="e.g., before-deployment"
                value={snapshotName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSnapshotName(e.target.value)
                }
                className="font-mono"
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") {
                    handleCreateSnapshot();
                  }
                }}
              />
            </div>
            <div>
              <Label htmlFor="description" className="font-mono">
                Description (optional)
              </Label>
              <Textarea
                id="description"
                placeholder="e.g., Stable version before major refactor"
                value={snapshotDescription}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setSnapshotDescription(e.target.value)
                }
                className="font-mono"
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              className="font-mono"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSnapshot}
              disabled={createMutation.isPending || !snapshotName.trim()}
              className="font-mono"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 mr-2" />
                  Create
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">
              Delete Snapshot?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono">
              This action cannot be undone. The snapshot will be permanently
              deleted from storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteConfirmId && handleDeleteSnapshot(deleteConfirmId)
              }
              className="bg-red-500 hover:bg-red-600 font-mono"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
