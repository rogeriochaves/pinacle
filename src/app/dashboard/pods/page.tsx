"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Server,
  Plus,
  Play,
  Square,
  Trash2,
  ExternalLink,
  MoreHorizontal,
  Filter
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { api } from "../../../lib/trpc/client";

const StatusBadge = ({ status }: { status: string }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "bg-green-100 text-green-800";
      case "stopped":
        return "bg-gray-100 text-gray-800";
      case "creating":
      case "starting":
        return "bg-yellow-100 text-yellow-800";
      case "error":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <Badge className={getStatusColor(status)}>
      {status}
    </Badge>
  );
};

export default function PodsPage() {
  const [search, setSearch] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [podToDelete, setPodToDelete] = useState<string | null>(null);

  const { data: pods, isLoading, refetch } = api.pods.getUserPods.useQuery();
  const startPodMutation = api.pods.start.useMutation();
  const stopPodMutation = api.pods.stop.useMutation();
  const deletePodMutation = api.pods.delete.useMutation();

  const filteredPods = pods?.filter(pod =>
    pod.name.toLowerCase().includes(search.toLowerCase()) ||
    pod.description?.toLowerCase().includes(search.toLowerCase())
  ) || [];

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

  const handleDeletePod = async () => {
    if (!podToDelete) return;

    try {
      await deletePodMutation.mutateAsync({ id: podToDelete });
      refetch();
      setDeleteDialogOpen(false);
      setPodToDelete(null);
    } catch (error) {
      console.error("Failed to delete pod:", error);
    }
  };

  const openDeleteDialog = (podId: string) => {
    setPodToDelete(podId);
    setDeleteDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={`pod-loading-${i}`} className="h-48 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Pods</h1>
          <p className="mt-2 text-gray-600">
            Manage your development environments
          </p>
        </div>
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <Link href="/dashboard/pods/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Pod
          </Link>
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Search pods..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          Filter
        </Button>
      </div>

      {/* Pods Grid */}
      {filteredPods.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPods.map((pod) => (
            <Card key={pod.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <Server className="h-5 w-5 text-gray-400" />
                    <CardTitle className="text-lg">{pod.name}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {pod.status === "running" ? (
                        <DropdownMenuItem onClick={() => handleStopPod(pod.id)}>
                          <Square className="mr-2 h-4 w-4" />
                          Stop
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => handleStartPod(pod.id)}>
                          <Play className="mr-2 h-4 w-4" />
                          Start
                        </DropdownMenuItem>
                      )}
                      {pod.publicUrl && (
                        <DropdownMenuItem asChild>
                          <Link href={pod.publicUrl} target="_blank">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => openDeleteDialog(pod.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center space-x-2">
                  <StatusBadge status={pod.status} />
                  {pod.lastStartedAt && (
                    <span className="text-xs text-gray-500">
                      Started {new Date(pod.lastStartedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pod.description && (
                    <p className="text-sm text-gray-600">{pod.description}</p>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Resources:</span>
                    <span className="font-medium">
                      {pod.cpuCores} vCPU • {Math.round(pod.memoryMb / 1024)}GB RAM
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Monthly cost:</span>
                    <span className="font-medium text-green-600">
                      ${(pod.monthlyPrice / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-3">
                    {pod.status === "running" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStopPod(pod.id)}
                        disabled={stopPodMutation.isPending}
                      >
                        <Square className="mr-2 h-4 w-4" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStartPod(pod.id)}
                        disabled={startPodMutation.isPending}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Start
                      </Button>
                    )}

                    {pod.publicUrl && pod.status === "running" && (
                      <Button variant="default" size="sm" asChild>
                        <Link href={pod.publicUrl} target="_blank">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Server className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            {search ? "No pods found" : "No pods yet"}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {search
              ? "Try adjusting your search terms"
              : "Get started by creating your first development environment."
            }
          </p>
          {!search && (
            <div className="mt-6">
              <Button asChild className="bg-blue-600 hover:bg-blue-700">
                <Link href="/dashboard/pods/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first pod
                </Link>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your pod
              and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePod}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
