"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Server,
  Users,
  Clock,
  TrendingUp,
  Plus,
  ExternalLink,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { api } from "../../lib/trpc/client";

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

  return <Badge className={getStatusColor(status)}>{status}</Badge>;
};

export default function Dashboard() {
  const { data: session } = useSession();
  const { data: pods, isLoading: podsLoading } =
    api.pods.getUserPods.useQuery();
  const { data: teams, isLoading: teamsLoading } =
    api.teams.getUserTeams.useQuery();

  const runningPods = pods?.filter((pod) => pod.status === "running") || [];
  const totalPods = pods?.length || 0;
  const totalTeams = teams?.length || 0;

  const stats = [
    {
      name: "Total Pods",
      value: totalPods,
      icon: Server,
      change: "+12%",
    },
    {
      name: "Running Pods",
      value: runningPods.length,
      icon: Server,
      change: "+19%",
    },
    {
      name: "Teams",
      value: totalTeams,
      icon: Users,
      change: "+2",
    },
    {
      name: "Uptime",
      value: "99.9%",
      icon: Clock,
      change: "+0.1%",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Welcome back, {session?.user?.name?.split(" ")[0]}
          </h1>
          <p className="mt-2 text-gray-600">
            Here's what's happening with your development environments today.
          </p>
        </div>
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <Link href="/dashboard/pods/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Pod
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.name}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      {stat.name}
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      {stat.value}
                    </p>
                  </div>
                  <Icon className="h-8 w-8 text-gray-400" />
                </div>
                <div className="mt-4 flex items-center">
                  <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-sm text-green-600">{stat.change}</span>
                  <span className="text-sm text-gray-500 ml-1">
                    from last month
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Pods */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Pods</CardTitle>
                <CardDescription>
                  Your latest development environments
                </CardDescription>
              </div>
              <Button variant="outline" asChild>
                <Link href="/dashboard/pods">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {podsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={`pod-skeleton-${i}`} className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : pods && pods.length > 0 ? (
              <div className="space-y-4">
                {pods.slice(0, 5).map((pod) => (
                  <div
                    key={pod.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center space-x-3">
                      <Server className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900">{pod.name}</p>
                        <p className="text-sm text-gray-500">
                          {pod.cpuCores} vCPU •{" "}
                          {Math.round(pod.memoryMb / 1024)}GB RAM
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <StatusBadge status={pod.status} />
                      {pod.publicUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={pod.publicUrl} target="_blank">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Server className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No pods yet
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by creating your first development environment.
                </p>
                <div className="mt-6">
                  <Button asChild className="bg-blue-600 hover:bg-blue-700">
                    <Link href="/dashboard/pods/new">
                      <Plus className="mr-2 h-4 w-4" />
                      Create your first pod
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Teams */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Teams</CardTitle>
                <CardDescription>
                  Collaborate with your team members
                </CardDescription>
              </div>
              <Button variant="outline" asChild>
                <Link href="/dashboard/teams">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {teamsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={`team-skeleton-${i}`} className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : teams && teams.length > 0 ? (
              <div className="space-y-4">
                {teams.slice(0, 5).map((team) => (
                  <div
                    key={team.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center space-x-3">
                      <Users className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900">{team.name}</p>
                        <p className="text-sm text-gray-500">
                          {team.role} • Created{" "}
                          {new Date(team.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{team.role}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No teams yet
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Create a team to collaborate with others.
                </p>
                <div className="mt-6">
                  <Button asChild variant="outline">
                    <Link href="/dashboard/teams/new">
                      <Plus className="mr-2 h-4 w-4" />
                      Create team
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
