"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { RESOURCE_TIERS } from "../../lib/pod-orchestration/resource-tier-registry";
import { getTemplateUnsafe } from "../../lib/pod-orchestration/template-registry";
import type { GitHubOrg, GitHubRepo, SetupFormValues } from "../../types/setup";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { ConfigurationSummary } from "./configuration-summary";
import { EnvironmentVariables } from "./environment-variables";
import { RepositorySelector } from "./repository-selector";
import { TemplateSelector } from "./template-selector";
import { TierSelectorSetup } from "./tier-selector-setup";

type EnvVar = {
  key: string;
  value: string;
  isSecret: boolean;
};

type ConfigureFormProps = {
  form: UseFormReturn<SetupFormValues>;
  onSubmit: (data: SetupFormValues) => Promise<void>;
  repositories: GitHubRepo[];
  organizations: GitHubOrg[];
  installationUrl: string | null;
};

export const ConfigureForm = ({
  form,
  onSubmit,
  repositories,
  organizations,
  installationUrl,
}: ConfigureFormProps) => {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [showSecrets, setShowSecrets] = useState<Record<number, boolean>>({});
  const [isCreating, setIsCreating] = useState(false);

  const setupType = form.watch("setupType");
  const selectedRepo = form.watch("selectedRepo");
  const selectedOrg = form.watch("selectedOrg");
  const newRepoName = form.watch("newRepoName");
  const bundle = form.watch("bundle");
  const tier = form.watch("tier");

  // Get selected template data
  const selectedTemplate = bundle ? getTemplateUnsafe(bundle) : undefined;

  // Get selected tier or use template's default tier
  const selectedTier = tier || selectedTemplate?.tier || "dev.small";
  const tierData = RESOURCE_TIERS[selectedTier];

  const projectName: string =
    setupType === "repository"
      ? selectedRepo || ""
      : `${selectedOrg || ""}/${newRepoName || ""}`;

  // Auto-select first org for "new" mode
  React.useEffect(() => {
    if (setupType === "new" && organizations.length > 0 && !selectedOrg) {
      form.setValue("selectedOrg", organizations[0].login);
    }
  }, [setupType, organizations, selectedOrg, form]);

  // Initialize environment variables when bundle changes
  React.useEffect(() => {
    if (selectedTemplate) {
      const newEnvVars = selectedTemplate.requiredEnvVars.map((key) => ({
        key,
        value: "",
        isSecret:
          key.includes("SECRET") ||
          key.includes("KEY") ||
          key.includes("TOKEN"),
      }));
      setEnvVars(newEnvVars);
      form.setValue("bundle", selectedTemplate.id);
    }
  }, [selectedTemplate, form]);

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: "", value: "", isSecret: false }]);
  };

  const updateEnvVar = (
    index: number,
    field: keyof EnvVar,
    value: string | boolean,
  ) => {
    const updated = [...envVars];
    updated[index] = { ...updated[index], [field]: value };
    setEnvVars(updated);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const toggleSecretVisibility = (index: number) => {
    setShowSecrets((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleSubmit = async () => {
    if (!canCreate()) return;

    setIsCreating(true);

    try {
      // Prepare environment variables
      const envVarsObject: Record<string, string> = {};
      envVars.forEach((env) => {
        if (env.key && env.value) {
          envVarsObject[env.key] = env.value;
        }
      });

      form.setValue("envVars", envVarsObject);

      const formData = form.getValues();
      await onSubmit(formData);
    } catch (error) {
      console.error("Failed to create pod:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const canCreate = () => {
    if (!selectedTemplate) return false;

    // Check if repository/project is selected
    if (setupType === "repository" && !selectedRepo) return false;
    if (setupType === "new" && (!selectedOrg || !newRepoName)) return false;

    const requiredVarsSet = selectedTemplate.requiredEnvVars.every((key) => {
      const envVar = envVars.find((ev) => ev.key === key);
      return envVar && envVar.value.trim() !== "";
    });

    return requiredVarsSet;
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="flex-4 bg-slate-50 flex justify-end overflow-y-auto">
        <div className="w-full max-w-3xl px-8 py-8">
          {/* Back button with title */}
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
              Configure Your Pod
            </h1>
          </div>

          <div className="space-y-6">
            {/* Repository Selection */}
            <RepositorySelector
              form={form}
              repositories={repositories}
              organizations={organizations}
              installationUrl={installationUrl}
            />

            {/* Template Selection */}
            <div>
              <Label className="text-xs font-mono font-medium text-slate-600 mb-3 block">
                SELECT TEMPLATE
              </Label>
              <TemplateSelector
                selectedTemplate={bundle}
                onTemplateChange={(templateId) =>
                  form.setValue("bundle", templateId)
                }
                compact={true}
              />
            </div>

            {/* Resource Tier Selection */}
            <div>
              <Label className="text-xs font-mono font-medium text-slate-600 mb-3 block">
                COMPUTE RESOURCES
              </Label>
              <TierSelectorSetup
                value={selectedTier}
                onChange={(tierId) =>
                  form.setValue(
                    "tier",
                    tierId as
                      | "dev.small"
                      | "dev.medium"
                      | "dev.large"
                      | "dev.xlarge",
                  )
                }
              />
            </div>

            {/* Environment Variables */}
            <EnvironmentVariables
              envVars={envVars}
              showSecrets={showSecrets}
              requiredCount={selectedTemplate?.requiredEnvVars.length || 0}
              onUpdate={updateEnvVar}
              onRemove={removeEnvVar}
              onAdd={addEnvVar}
              onToggleSecret={toggleSecretVisibility}
            />
          </div>
        </div>
      </div>

      {/* Right side - Summary */}
      <ConfigurationSummary
        projectName={projectName}
        selectedTemplate={selectedTemplate}
        tierData={tierData}
        onSubmit={handleSubmit}
        canCreate={canCreate}
        isCreating={isCreating}
      />
    </div>
  );
};
