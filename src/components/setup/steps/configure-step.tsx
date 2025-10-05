"use client";

import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import React, { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { RESOURCE_TIERS } from "../../../lib/pod-orchestration/resource-tier-registry";
import { getTemplateUnsafe } from "../../../lib/pod-orchestration/template-registry";
import type { SetupFormValues } from "../../../types/setup";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { TemplateSelector } from "../template-selector";
import { TierSelectorSetup } from "../tier-selector-setup";

interface EnvVar {
  key: string;
  value: string;
  isSecret: boolean;
}

interface ConfigureStepProps {
  form: UseFormReturn<SetupFormValues>;
  onSubmit: (data: SetupFormValues) => Promise<void>;
  onBack: () => void;
}

// Form Section Component (Left Side)
const FormSection = ({
  onBack,
  form,
  podName,
  bundle,
  selectedTier,
  selectedTemplate,
  envVars,
  showSecrets,
  updateEnvVar,
  removeEnvVar,
  toggleSecretVisibility,
  addEnvVar,
}: {
  onBack: () => void;
  form: UseFormReturn<SetupFormValues>;
  podName: string | undefined;
  bundle: string | undefined;
  selectedTier: string;
  selectedTemplate: ReturnType<typeof getTemplateUnsafe> | undefined;
  envVars: EnvVar[];
  showSecrets: Record<number, boolean>;
  updateEnvVar: (
    index: number,
    field: keyof EnvVar,
    value: string | boolean,
  ) => void;
  removeEnvVar: (index: number) => void;
  toggleSecretVisibility: (index: number) => void;
  addEnvVar: () => void;
}) => {
  return (
    <div className="flex-4 bg-slate-50 flex justify-end overflow-y-auto">
      <div className="w-full max-w-3xl px-8 py-8">
        {/* Back button with title */}
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" onClick={onBack} className="-ml-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            <span className="font-mono text-sm">Back</span>
          </Button>
          <h1 className="text-2xl font-mono font-bold text-slate-900">
            Configure Your Pod
          </h1>
        </div>

        <div className="space-y-6">
          {/* Pod Name */}
          <div>
            <Label className="text-xs font-mono font-medium text-slate-600 mb-2 block">
              POD NAME
            </Label>
            <Input
              placeholder="my-awesome-project-dev"
              value={podName || ""}
              onChange={(e) => form.setValue("podName", e.target.value)}
              className="font-mono"
            />
          </div>

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
          <div>
            <Label className="text-xs font-mono font-medium text-slate-600 mb-3 block">
              ENVIRONMENT VARIABLES
              {selectedTemplate &&
                selectedTemplate.requiredEnvVars.length > 0 && (
                  <span className="text-orange-600 ml-2">
                    ({selectedTemplate.requiredEnvVars.length} required)
                  </span>
                )}
            </Label>

            <div className="space-y-2">
              {envVars.map((envVar, index) => (
                <div
                  key={`env-${index}-${envVar.key}`}
                  className="flex items-start gap-2 p-3 bg-white rounded-lg border border-gray-200"
                >
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="VARIABLE_NAME"
                      value={envVar.key}
                      onChange={(e) =>
                        updateEnvVar(index, "key", e.target.value)
                      }
                      className="font-mono text-xs h-8"
                    />
                    <div className="relative">
                      <Input
                        type={
                          envVar.isSecret && !showSecrets[index]
                            ? "password"
                            : "text"
                        }
                        placeholder="value"
                        value={envVar.value}
                        onChange={(e) =>
                          updateEnvVar(index, "value", e.target.value)
                        }
                        className="font-mono text-xs h-8 pr-8"
                      />
                      {envVar.isSecret && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                          onClick={() => toggleSecretVisibility(index)}
                        >
                          {showSecrets[index] ? (
                            <EyeOff className="h-3 w-3 text-slate-500" />
                          ) : (
                            <Eye className="h-3 w-3 text-slate-500" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEnvVar(index)}
                    className="h-6 w-6 p-0 shrink-0"
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={addEnvVar}
                className="w-full font-mono text-xs h-9"
              >
                <Plus className="mr-2 h-3 w-3" /> Add Variable
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Summary Section Component (Right Side)
const SummarySection = ({
  podName,
  projectName,
  selectedTemplate,
  tierData,
  handleSubmit,
  canCreate,
  isCreating,
}: {
  podName: string | undefined;
  projectName: string;
  selectedTemplate: ReturnType<typeof getTemplateUnsafe> | undefined;
  tierData: (typeof RESOURCE_TIERS)[keyof typeof RESOURCE_TIERS];
  handleSubmit: () => Promise<void>;
  canCreate: () => boolean;
  isCreating: boolean;
}) => {
  return (
    <div className="flex-3 bg-slate-900 border-l border-slate-800 flex justify-start overflow-y-auto">
      <div className="w-full max-w-md p-8 pt-34 space-y-8">
        {/* Summary Section */}
        <div className="space-y-6">
          <div>
            <h3 className="text-white font-mono text-sm font-medium mb-4">
              Your Configuration
            </h3>
            <div className="space-y-3">
              {/* Pod Name */}
              <div className="flex items-start gap-3 text-sm">
                <svg
                  className="w-4 h-4 text-green-400 mt-0.5 shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-300 font-mono text-xs mb-0.5">
                    Pod name
                  </p>
                  <p className="text-white font-mono font-medium truncate">
                    {podName || "Not set"}
                  </p>
                </div>
              </div>

              {/* Project */}
              <div className="flex items-start gap-3 text-sm">
                <svg
                  className="w-4 h-4 text-green-400 mt-0.5 shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-300 font-mono text-xs mb-0.5">
                    Project
                  </p>
                  <p className="text-white font-mono text-sm break-all">
                    {projectName}
                  </p>
                </div>
              </div>

              {/* Template */}
              {selectedTemplate && (
                <div className="flex items-start gap-3 text-sm">
                  <svg
                    className="w-4 h-4 text-green-400 mt-0.5 shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 font-mono text-xs mb-0.5">
                      Template
                    </p>
                    <div className="flex items-center gap-2">
                      {selectedTemplate.icon && (
                        <Image
                          src={
                            selectedTemplate.icon.includes("nextjs")
                              ? "/logos/nextjs-white.svg"
                              : selectedTemplate.icon.includes("langflow")
                                ? "/logos/langflow-white.svg"
                                : selectedTemplate.icon
                          }
                          alt={
                            selectedTemplate.iconAlt || selectedTemplate.name
                          }
                          width={16}
                          height={16}
                        />
                      )}
                      <p className="text-white font-mono text-sm">
                        {selectedTemplate.name}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Resources */}
              <div className="flex items-start gap-3 text-sm">
                <svg
                  className="w-4 h-4 text-green-400 mt-0.5 shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-slate-300 font-mono text-xs mb-1">
                    Resources
                  </p>
                  <p className="text-white font-mono text-sm">
                    {tierData.cpu} vCPU • {tierData.memory}GB RAM •{" "}
                    {tierData.storage}GB Storage
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="pt-6 border-t border-slate-800">
            <div className="mb-4">
              <p className="text-slate-400 font-mono text-xs mb-1">
                Estimated cost
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-white font-mono text-3xl font-bold">
                  ${tierData?.price || 0}
                </span>
                <span className="text-slate-400 font-mono text-sm">/month</span>
              </div>
              <p className="text-slate-500 font-mono text-xs mt-1">
                Billed hourly based on usage
              </p>
            </div>

            {/* Create Button */}
            <Button
              onClick={handleSubmit}
              disabled={!canCreate() || isCreating}
              size="lg"
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-mono font-bold h-12"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Create Pod
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Component
export const ConfigureStep = ({
  form,
  onSubmit,
  onBack,
}: ConfigureStepProps) => {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [showSecrets, setShowSecrets] = useState<Record<number, boolean>>({});
  const [isCreating, setIsCreating] = useState(false);

  const setupType = form.watch("setupType");
  const selectedRepo = form.watch("selectedRepo");
  const selectedOrg = form.watch("selectedOrg");
  const newRepoName = form.watch("newRepoName");
  const podName = form.watch("podName");
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

  // Initialize pod name from repo/project name
  React.useEffect(() => {
    if (setupType === "repository" && selectedRepo && !podName) {
      form.setValue("podName", selectedRepo.split("/")[1]);
    } else if (setupType === "new" && newRepoName && !podName) {
      form.setValue("podName", newRepoName);
    }
  }, [setupType, selectedRepo, newRepoName, podName, form]);

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

    const requiredVarsSet = selectedTemplate.requiredEnvVars.every((key) => {
      const envVar = envVars.find((ev) => ev.key === key);
      return envVar && envVar.value.trim() !== "";
    });

    return podName?.trim() !== "" && requiredVarsSet;
  };

  return (
    <div className="min-h-screen flex">
      <FormSection
        onBack={onBack}
        form={form}
        podName={podName}
        bundle={bundle}
        selectedTier={selectedTier}
        selectedTemplate={selectedTemplate}
        envVars={envVars}
        showSecrets={showSecrets}
        updateEnvVar={updateEnvVar}
        removeEnvVar={removeEnvVar}
        toggleSecretVisibility={toggleSecretVisibility}
        addEnvVar={addEnvVar}
      />
      <SummarySection
        podName={podName}
        projectName={projectName}
        selectedTemplate={selectedTemplate}
        tierData={tierData}
        handleSubmit={handleSubmit}
        canCreate={canCreate}
        isCreating={isCreating}
      />
    </div>
  );
};
