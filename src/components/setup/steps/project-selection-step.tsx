"use client";

import {
  ArrowLeft,
  ArrowRight,
  Calendar,
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
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
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
    <div className="min-h-screen bg-slate-100">
      {/* Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" asChild className="-ml-2">
            <Link
              href="/"
              className="font-mono text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-2xl font-mono font-bold text-slate-900">
            {setupType === "repository"
              ? "Select Repository"
              : "Create New Project"}
          </h1>
        </div>

        {/* Type Selector */}
        <div className="mb-8 flex justify-center gap-4">
          <button
            type="button"
            onClick={() => form.setValue("setupType", "repository")}
            className={`px-6 py-3 rounded-lg font-mono font-medium transition-all ${
              setupType === "repository"
                ? "bg-white text-slate-900 shadow-md ring-2 ring-orange-500"
                : "bg-white text-slate-600 shadow-sm hover:shadow-md"
            }`}
          >
            Open Repository
          </button>
          <button
            type="button"
            onClick={() => form.setValue("setupType", "new")}
            className={`px-6 py-3 rounded-lg font-mono font-medium transition-all ${
              setupType === "new"
                ? "bg-white text-slate-900 shadow-md ring-2 ring-orange-500"
                : "bg-white text-slate-600 shadow-sm hover:shadow-md"
            }`}
          >
            + New Project
          </button>
        </div>

        {setupType === "repository" ? (
          <div className="max-w-4xl mx-auto">
            {/* Filters Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Label className="text-xs font-mono font-medium text-slate-600 mb-2 block">
                    ORGANIZATION
                  </Label>
                  <Select
                    value={selectedOrg || "all"}
                    onValueChange={(value) =>
                      form.setValue("selectedOrg", value)
                    }
                  >
                    <SelectTrigger className="font-mono">
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
                            <span className="font-mono">{org.login}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex-1">
                  <Label className="text-xs font-mono font-medium text-slate-600 mb-2 block">
                    SEARCH
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search repositories..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (installationUrl) {
                        window.location.href = installationUrl;
                      }
                    }}
                    disabled={!installationUrl}
                    className="font-mono"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Org
                  </Button>
                </div>
              </div>
            </div>

            {/* Repositories List */}
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {filteredRepositories.map((repo) => {
                const isSelected = selectedRepo === repo.full_name;
                return (
                  <button
                    key={repo.id}
                    type="button"
                    className={`relative w-full text-left bg-white rounded-xl p-6 transition-all ${
                      isSelected
                        ? "ring-2 ring-orange-500 shadow-lg"
                        : "shadow-sm border border-gray-200 hover:shadow-md hover:-translate-y-0.5"
                    }`}
                    onClick={() =>
                      form.setValue("selectedRepo", repo.full_name)
                    }
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="font-mono font-bold text-lg text-slate-900">
                            {repo.name}
                          </h3>
                          {repo.private && (
                            <Badge variant="secondary" className="text-xs">
                              Private
                            </Badge>
                          )}
                          {repo.language && (
                            <Badge
                              variant="outline"
                              className="text-xs font-mono"
                            >
                              {repo.language}
                            </Badge>
                          )}
                        </div>
                        {repo.description && (
                          <p className="text-sm text-slate-600 mb-3">
                            {repo.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3" />
                            {repo.stargazers_count}
                          </div>
                          <div className="flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            {repo.default_branch}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
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
                        className="w-10 h-10 rounded-full flex-shrink-0"
                      />
                    </div>
                    {isSelected && (
                      <div className="absolute top-4 right-4">
                        <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
                          <svg
                            className="w-4 h-4 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}

              {filteredRepositories.length === 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                  <p className="text-slate-500 font-mono">
                    {searchQuery
                      ? "No repositories match your search."
                      : isLoadingRepositories
                        ? "Loading repositories..."
                        : "No repositories found."}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Project Details Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-xl font-mono font-bold text-slate-900 mb-6">
                Project Details
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-xs font-mono font-medium text-slate-600 mb-2 block">
                    ORGANIZATION
                  </Label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedOrg || ""}
                      onValueChange={(value) =>
                        form.setValue("selectedOrg", value)
                      }
                    >
                      <SelectTrigger className="font-mono">
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
                              <span className="font-mono">{org.login}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (installationUrl) {
                          window.location.href = installationUrl;
                        }
                      }}
                      disabled={!installationUrl}
                      className="font-mono shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-mono font-medium text-slate-600 mb-2 block">
                    REPOSITORY NAME
                  </Label>
                  <Input
                    placeholder="my-awesome-project"
                    value={newRepoName || ""}
                    onChange={(e) =>
                      form.setValue("newRepoName", e.target.value)
                    }
                    className="font-mono"
                  />
                  {selectedOrg && newRepoName && (
                    <p className="text-sm text-slate-500 mt-2 font-mono">
                      {selectedOrg}/{newRepoName}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Template Selection */}
            <div>
              <h2 className="text-xl font-mono font-bold text-slate-900 mb-4">
                Choose Your Stack
              </h2>
              <p className="text-slate-600 mb-6">
                Select a template to kickstart your project with the best tools
              </p>
              <TemplateSelector
                selectedTemplate={selectedBundle}
                onTemplateChange={(templateId: string) =>
                  form.setValue("bundle", templateId)
                }
                compact={true}
              />
            </div>
          </div>
        )}

        {/* Continue Button - Fixed at bottom */}
        <div className="max-w-7xl mx-auto mt-12 pb-8 flex justify-end">
          <Button
            onClick={handleContinue}
            disabled={!canContinue()}
            size="lg"
            className="bg-orange-500 hover:bg-orange-600 text-white font-mono font-bold px-8 shadow-lg hover:shadow-xl transition-all"
          >
            Continue
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
