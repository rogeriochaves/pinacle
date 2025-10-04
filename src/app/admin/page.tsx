"use client";

import { useEffect } from "react";
import { ServerCard } from "@/components/admin/server-card";
import { api } from "@/lib/trpc/client";

export default function AdminPage() {
  const { data: stats, refetch: refetchStats } =
    api.admin.getPlatformStats.useQuery();
  const {
    data: servers,
    isLoading,
    refetch: refetchServers,
  } = api.admin.getAllServers.useQuery();

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      void refetchServers();
      void refetchStats();
    }, 5000);

    return () => clearInterval(interval);
  }, [refetchServers, refetchStats]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded mb-4"></div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="mt-2 text-sm text-gray-500">
          Monitor servers and system resources
        </p>
      </div>

      {/* Platform Stats */}
      {stats && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-medium text-gray-500">Total Users</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {stats.totalUsers}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-medium text-gray-500">Total Teams</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {stats.totalTeams}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-medium text-gray-500">Total Pods</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {stats.totalPods}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-medium text-gray-500">Active Pods</div>
            <div className="mt-2 text-3xl font-bold text-green-600">
              {stats.activePods}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-medium text-gray-500">Servers</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {stats.totalServers}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm font-medium text-gray-500">Online</div>
            <div className="mt-2 text-3xl font-bold text-green-600">
              {stats.onlineServers}
            </div>
          </div>
        </div>
      )}

      {/* Servers Grid */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Servers</h2>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
            Auto-refreshing every 5s
          </div>
        </div>

        {!servers || servers.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
            <p className="text-gray-500">No servers found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {servers
              .sort((a, b) => b.id.localeCompare(a.id))
              .sort((a, b) => a.hostname.localeCompare(b.hostname))
              .map((server) => (
                <ServerCard key={server.id} server={server} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
