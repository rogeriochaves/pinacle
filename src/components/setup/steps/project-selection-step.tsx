"use client";

import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  FolderGit2,
  GitBranch,
  Plus,
  Search,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type {
  GitHubOrg,
  GitHubRepo,
  SetupFormData,
  SetupFormValues,
} from "../../../types/setup";
import { TierSelector } from "../../shared/tier-selector";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { TemplateSelector } from "../template-selector";

interface ProjectSelectionStepProps {
  form: UseFormReturn<SetupFormValues>;
  repositories: GitHubRepo[];
  organizations: GitHubOrg[];
  installationUrl: string | null;
  onContinue: (data: Partial<SetupFormData>) => void;
  isLoadingRepositories: boolean;
}

export const ProjectSelectionStep = ({
  form,
  repositories,
  organizations,
  installationUrl,
  onContinue,
  isLoadingRepositories,
}: ProjectSelectionStepProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const setupType = form.watch("setupType");
  const selectedRepo = form.watch("selectedRepo");
  const selectedOrg = form.watch("selectedOrg");
  const newRepoName = form.watch("newRepoName");
  const selectedBundle = form.watch("bundle");
  const selectedTier = form.watch("tier") || "dev.small";

  // Filter repositories by organization and search
  const filteredRepositories = repositories.filter((repo: GitHubRepo) => {
    const matchesSearch =
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.description?.toLowerCase().includes(searchQuery.toLowerCase());

    // For repository selection, also filter by selected organization
    if (setupType === "repository" && selectedOrg && selectedOrg !== "all") {
      return matchesSearch && repo.owner.login === selectedOrg;
    }

    return matchesSearch;
  });

  const handleContinue = () => {
    if (setupType === "repository" && selectedRepo) {
      onContinue({
        setupType,
        selectedRepo,
      });
    } else if (
      setupType === "new" &&
      newRepoName &&
      selectedOrg &&
      selectedBundle
    ) {
      onContinue({
        setupType,
        newRepoName,
        selectedOrg,
        bundle: selectedBundle,
      });
    }
  };

  const canContinue = () => {
    if (setupType === "repository") {
      return selectedRepo !== "";
    } else {
      return (
        newRepoName?.trim() !== "" &&
        selectedOrg !== "" &&
        selectedBundle !== ""
      );
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="flex items-center space-x-4 mb-8">
        <Button variant="ghost" asChild>
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
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

      {setupType === "repository" ? (
        <div className="space-y-6">
          {/* Repository Selection */}
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
                <Label htmlFor="organization">Filter by Organization</Label>
                <Select
                  value={selectedOrg || "all"}
                  onValueChange={(value) => form.setValue("selectedOrg", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All organizations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All organizations</SelectItem>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.login}>
                        <div className="flex items-center space-x-2">
                          {/** biome-ignore lint/performance/noImgElement: nah */}
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
                    onClick={() =>
                      form.setValue("selectedRepo", repo.full_name)
                    }
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
                            {new Date(
                              repo.updated_at || "",
                            ).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      {/** biome-ignore lint/performance/noImgElement: nah */}
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
                      : isLoadingRepositories
                        ? "Loading repositories..."
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
                <Select
                  value={selectedOrg || ""}
                  onValueChange={(value) => form.setValue("selectedOrg", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.login}>
                        <div className="flex items-center space-x-2">
                          {/** biome-ignore lint/performance/noImgElement: nah */}
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
                  value={newRepoName || ""}
                  onChange={(e) => form.setValue("newRepoName", e.target.value)}
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

              {/* Template Selection for New Projects */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">
                  Choose Your Stack
                </Label>
                <TemplateSelector
                  selectedTemplate={selectedBundle}
                  onTemplateChange={(templateId: string) =>
                    form.setValue("bundle", templateId)
                  }
                />
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
  );
};
