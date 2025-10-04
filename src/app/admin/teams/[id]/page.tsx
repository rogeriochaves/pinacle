"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/trpc/client";

export default function TeamDetailPage() {
  const params = useParams();
  const teamId = params?.id as string;

  const { data, isLoading } = api.admin.getTeamDetails.useQuery({ teamId });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Team not found</h1>
          <Link
            href="/admin/users"
            className="mt-4 inline-flex items-center text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to users
          </Link>
        </div>
      </div>
    );
  }

  const { team, owner, members, pods } = data;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/users"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to users
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">{team.name}</h1>
        {team.description && (
          <p className="mt-1 text-sm text-gray-500">{team.description}</p>
        )}
      </div>

      {/* Team Info Card */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Team Information
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-gray-500">Team ID</div>
            <div className="mt-1 font-mono text-sm text-gray-900">
              {team.id}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">Slug</div>
            <div className="mt-1 text-sm text-gray-900">{team.slug}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">Owner</div>
            <div className="mt-1 text-sm text-gray-900">
              {owner ? (
                <Link
                  href={`/admin/users/${owner.id}`}
                  className="text-blue-600 hover:text-blue-700"
                >
                  {owner.name || owner.email}
                </Link>
              ) : (
                "Unknown"
              )}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">Created</div>
            <div className="mt-1 text-sm text-gray-900">
              {new Date(team.createdAt).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Team Members */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Team Members
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        </div>
        {members.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No members found
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {members.map(({ membership, user }) => (
              <div key={membership.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {user.name || "N/A"}
                      </Link>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          membership.role === "owner"
                            ? "bg-purple-100 text-purple-800"
                            : membership.role === "admin"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {membership.role}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {user.email}
                    </div>
                    {user.githubUsername && (
                      <div className="mt-1 text-xs text-gray-400">
                        @{user.githubUsername}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <div>Joined {new Date(membership.joinedAt).toLocaleDateString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team Pods */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900">Team Pods</h2>
          <p className="mt-1 text-sm text-gray-500">
            {pods.length} pod{pods.length !== 1 ? "s" : ""}
          </p>
        </div>
        {pods.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No pods created yet
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {pods.map(({ pod, owner }) => (
              <Link
                key={pod.id}
                href={`/admin/pods/${pod.id}`}
                className="block p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 hover:text-blue-600">
                        {pod.name}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          pod.status === "running"
                            ? "bg-green-100 text-green-800"
                            : pod.status === "stopped"
                              ? "bg-gray-100 text-gray-800"
                              : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {pod.status}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                        {pod.tier}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                      <span>
                        Owner:{" "}
                        {owner ? (
                          <Link
                            href={`/admin/users/${owner.id}`}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            {owner.name || owner.email}
                          </Link>
                        ) : (
                          "Unknown"
                        )}
                      </span>
                      {pod.githubRepo && (
                        <>
                          <span>•</span>
                          <a
                            href={`https://github.com/${pod.githubRepo}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600"
                          >
                            {pod.githubRepo}
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <div>Created {new Date(pod.createdAt).toLocaleDateString()}</div>
                    {pod.publicUrl && (
                      <a
                        href={pod.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center text-blue-600 hover:text-blue-700"
                      >
                        Open
                      </a>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

