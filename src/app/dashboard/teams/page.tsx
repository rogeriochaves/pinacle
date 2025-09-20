"use client";

import Link from "next/link";
import { Users, Plus, Crown, Shield, User } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { api } from "../../../lib/trpc/client";

const RoleIcon = ({ role }: { role: string }) => {
  switch (role) {
    case "owner":
      return <Crown className="h-4 w-4 text-yellow-500" />;
    case "admin":
      return <Shield className="h-4 w-4 text-blue-500" />;
    default:
      return <User className="h-4 w-4 text-gray-500" />;
  }
};

export default function TeamsPage() {
  const { data: teams, isLoading } = api.teams.getUserTeams.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={`team-loading-${i}`} className="h-48 bg-gray-200 rounded"></div>
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
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Teams</h1>
          <p className="mt-2 text-gray-600">
            Collaborate with your team members on development projects
          </p>
        </div>
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <Link href="/dashboard/teams/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Team
          </Link>
        </Button>
      </div>

      {/* Teams Grid */}
      {teams && teams.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((team) => (
            <Card key={team.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <Users className="h-5 w-5 text-gray-400" />
                    <CardTitle className="text-lg">{team.name}</CardTitle>
                  </div>
                  <Badge variant="outline" className="flex items-center space-x-1">
                    <RoleIcon role={team.role} />
                    <span className="capitalize">{team.role}</span>
                  </Badge>
                </div>
                {team.description && (
                  <CardDescription>{team.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Created:</span>
                    <span className="font-medium">
                      {new Date(team.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-3">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/teams/${team.id}`}>
                        View Details
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No teams yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create a team to collaborate with others on development projects.
          </p>
          <div className="mt-6">
            <Button asChild className="bg-blue-600 hover:bg-blue-700">
              <Link href="/dashboard/teams/new">
                <Plus className="mr-2 h-4 w-4" />
                Create your first team
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
