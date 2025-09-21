"use client";

import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  FolderGit2,
  GitBranch,
  Loader2,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { api } from "../../../lib/trpc/client";

type SetupType = "repository" | "new";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  stargazers_count: number;
  updated_at: string;
  default_branch: string;
  language: string | null;
  owner: {
    login: string;
    avatar_url: string;
  };
}

interface GitHubOrg {
  id: number;
  login: string;
  avatar_url: string;
  description: string | null;
}

const ProjectSelectionPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [setupType, setSetupType] = useState<SetupType>("repository");
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [newRepoName, setNewRepoName] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // tRPC queries
  const { data: repositories = [], isLoading: reposLoading } =
    api.github.getRepositories.useQuery(undefined, {
      enabled: !!session && !!(session.user as any).githubId,
    });
  const { data: organizations = [], isLoading: orgsLoading } =
    api.github.getOrganizations.useQuery(undefined, {
      enabled: !!session && !!(session.user as any).githubId,
    });

  // GitHub App queries
  const { data: installationData, isLoading: installationsLoading } = api.githubApp.getInstallations.useQuery();
  const { data: installationUrl } = api.githubApp.getInstallationUrl.useQuery({
    returnTo: `/setup/project?type=${setupType}`,
  });
  const { data: appRepositories = [] } = api.githubApp.getRepositoriesFromInstallations.useQuery(undefined, {
    enabled: installationData?.hasInstallations,
  });
  const { data: appAccounts = [] } = api.githubApp.getAccountsFromInstallations.useQuery(undefined, {
    enabled: installationData?.hasInstallations,
  });

  // Check if GitHub App is properly configured
  const isGitHubAppConfigured = installationUrl !== null;

  const isLoading = reposLoading || orgsLoading || installationsLoading;

  // Only use GitHub App repositories - no OAuth repos since GitHub App is required
  const allRepositories = appRepositories;

  // Only use GitHub App accounts - no OAuth personal account since GitHub App is required
  const allOrganizations = appAccounts;

  useEffect(() => {
    const type = searchParams.get("type") as SetupType;
    if (type === "repository" || type === "new") {
      setSetupType(type);
    }
  }, [searchParams]);

  // Auto-select first organization when available (only for "new" project flow)
  useEffect(() => {
    if (setupType === "new" && allOrganizations.length > 0 && !selectedOrg) {
      setSelectedOrg(allOrganizations[0].login);
    } else if (setupType === "repository" && !selectedOrg) {
      // For repository selection, default to "all"
      setSelectedOrg("all");
    }
  }, [allOrganizations, selectedOrg, setupType]);

  // Redirect if not authenticated with GitHub or no GitHub App installed
  useEffect(() => {
    if (status === "loading" || installationsLoading) return;

    if (!session || !(session.user as any).githubId) {
      router.push(`/setup?type=${setupType}`);
      return;
    }

    // If user doesn't have GitHub App installed, redirect back to install step
    if (installationData !== undefined && !installationData.hasInstallations) {
      router.push(`/setup/install?type=${setupType}`);
      return;
    }
  }, [session, status, setupType, router, installationData, installationsLoading]);

  const filteredRepositories = (allRepositories as GitHubRepo[]).filter(
    (repo: GitHubRepo) => {
      const matchesSearch = repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.description?.toLowerCase().includes(searchQuery.toLowerCase());

      // For repository selection, also filter by selected organization
      if (setupType === "repository" && selectedOrg && selectedOrg !== "all") {
        return matchesSearch && repo.owner.login === selectedOrg;
      }

      return matchesSearch;
    }
  );

  const handleContinue = () => {
    if (setupType === "repository" && selectedRepo) {
      const repo = (allRepositories as GitHubRepo[]).find(
        (r: GitHubRepo) => r.full_name === selectedRepo,
      );
      if (repo) {
        router.push(
          `/setup/configure?type=repository&repo=${encodeURIComponent(selectedRepo)}&branch=${repo.default_branch}`,
        );
      }
    } else if (setupType === "new" && newRepoName && selectedOrg) {
      router.push(
        `/setup/configure?type=new&org=${encodeURIComponent(selectedOrg)}&name=${encodeURIComponent(newRepoName)}`,
      );
    }
  };

  const canContinue = () => {
    if (setupType === "repository") {
      return selectedRepo !== "";
    } else {
      return newRepoName.trim() !== "" && selectedOrg !== "";
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Loading your GitHub repositories...
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => router.push("/")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {setupType === "repository"
                  ? "Select Repository"
                  : "Create New Project"}
              </h1>
              <p className="text-gray-600 mt-1">
                {setupType === "repository"
                  ? "Choose an existing repository to set up your development environment"
                  : "Create a new repository and set up your development environment"}
              </p>
            </div>
          </div>
        </div>

        {setupType === "repository" ? (
          <div className="space-y-6">
            {/* Search */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FolderGit2 className="mr-2 h-5 w-5" />
                  Your Repositories
                </CardTitle>
                <CardDescription>
                  Select a repository to create a development environment
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Organization Filter */}
                <div className="flex gap-2 mb-4">
                  <div className="flex-1">
                    <Label htmlFor="organization">Filter by Organization</Label>
                    <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                      <SelectTrigger>
                        <SelectValue placeholder="All organizations" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All organizations</SelectItem>
                        {allOrganizations.map((org) => (
                          <SelectItem key={org.id} value={org.login}>
                            <div className="flex items-center space-x-2">
                              <img
                                src={org.avatar_url}
                                alt={org.login}
                                className="w-5 h-5 rounded-full"
                              />
                              <span>{org.login}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (installationUrl) {
                          window.location.href = installationUrl;
                        }
                      }}
                      disabled={!installationUrl}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Organization
                    </Button>
                  </div>
                </div>

                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search repositories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredRepositories.map((repo) => (
                    <button
                      key={repo.id}
                      type="button"
                      className={`w-full text-left p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedRepo === repo.full_name
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                      onClick={() => setSelectedRepo(repo.full_name)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h3 className="font-semibold text-gray-900">
                              {repo.name}
                            </h3>
                            {repo.private && (
                              <Badge variant="secondary" className="text-xs">
                                Private
                              </Badge>
                            )}
                            {repo.language && (
                              <Badge variant="outline" className="text-xs">
                                {repo.language}
                              </Badge>
                            )}
                          </div>
                          {repo.description && (
                            <p className="text-sm text-gray-600 mb-2">
                              {repo.description}
                            </p>
                          )}
                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <div className="flex items-center">
                              <Star className="mr-1 h-3 w-3" />
                              {repo.stargazers_count}
                            </div>
                            <div className="flex items-center">
                              <GitBranch className="mr-1 h-3 w-3" />
                              {repo.default_branch}
                            </div>
                            <div className="flex items-center">
                              <Calendar className="mr-1 h-3 w-3" />
                              {new Date(repo.updated_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <img
                          src={repo.owner.avatar_url}
                          alt={repo.owner.login}
                          className="w-8 h-8 rounded-full"
                        />
                      </div>
                    </button>
                  ))}

                  {filteredRepositories.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      {searchQuery
                        ? "No repositories match your search."
                        : "No repositories found."}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-6">
            {/* New Project Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Plus className="mr-2 h-5 w-5" />
                  Create New Project
                </CardTitle>
                <CardDescription>
                  Set up a new repository and development environment
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 py-4">
                  <Label htmlFor="organization">Organization</Label>
                  <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {allOrganizations.map((org) => (
                        <SelectItem key={org.id} value={org.login}>
                          <div className="flex items-center space-x-2">
                            <img
                              src={org.avatar_url}
                              alt={org.login}
                              className="w-5 h-5 rounded-full"
                            />
                            <span>{org.login}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (installationUrl) {
                        window.location.href = installationUrl;
                      }
                    }}
                    disabled={!installationUrl}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Organization
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="repo-name">Repository Name</Label>
                  <Input
                    id="repo-name"
                    placeholder="my-awesome-project"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                  />
                  {selectedOrg && newRepoName && (
                    <p className="text-sm text-gray-500">
                      Repository will be created as:{" "}
                      <code className="bg-gray-100 px-1 rounded">
                        {selectedOrg}/{newRepoName}
                      </code>
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Continue Button */}
        <div className="flex justify-end mt-8">
          <Button
            onClick={handleContinue}
            disabled={!canContinue()}
            className="min-w-32"
          >
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProjectSelectionPage;
