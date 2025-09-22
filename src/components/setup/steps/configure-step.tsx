"use client";

import {
  ArrowLeft,
  ArrowRight,
  Cpu,
  Eye,
  EyeOff,
  HardDrive,
  Info,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import React, { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { bundles } from "../../../config/bundles";
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
import { BundleSelector } from "../bundle-selector";

interface EnvVar {
  key: string;
  value: string;
  isSecret: boolean;
}

interface ConfigureStepProps {
  form: UseFormReturn<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  onSubmit: (data: any) => Promise<void>; // eslint-disable-line @typescript-eslint/no-explicit-any
  onBack: () => void;
}

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

  // Get selected bundle data
  const selectedBundleData = bundles.find((b) => b.id === bundle);

  // Initialize environment variables when bundle changes
  React.useEffect(() => {
    if (selectedBundleData) {
      const newEnvVars = selectedBundleData.requiredEnvVars.map((key) => ({
        key,
        value: "",
        isSecret:
          key.includes("SECRET") ||
          key.includes("KEY") ||
          key.includes("TOKEN"),
      }));
      setEnvVars(newEnvVars);
      form.setValue("bundle", selectedBundleData.id);
    }
  }, [selectedBundleData, form]);

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
    if (!selectedBundleData) return false;

    const requiredVarsSet = selectedBundleData.requiredEnvVars.every((key) => {
      const envVar = envVars.find((ev) => ev.key === key);
      return envVar && envVar.value.trim() !== "";
    });

    return podName?.trim() !== "" && requiredVarsSet;
  };

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="flex items-center space-x-4 mb-8">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Configure Your Pod
          </h1>
          <p className="text-gray-600 mt-1">
            {setupType === "repository"
              ? `Setting up development environment for ${selectedRepo}`
              : `Creating new project: ${selectedOrg}/${newRepoName}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Pod Name */}
          <Card>
            <CardHeader>
              <CardTitle>Pod Name</CardTitle>
              <CardDescription>
                A unique name for your development environment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="my-awesome-project-dev"
                value={podName || ""}
                onChange={(e) => form.setValue("podName", e.target.value)}
              />
            </CardContent>
          </Card>

          {/* Bundle Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Choose a Bundle</CardTitle>
              <CardDescription>
                Choose your development environment configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BundleSelector
                selectedBundle={bundle}
                onBundleChange={(bundleId) => form.setValue("bundle", bundleId)}
                showPricing={true}
              />
            </CardContent>
          </Card>

          {/* Environment Variables */}
          <Card>
            <CardHeader>
              <CardTitle>Environment Variables</CardTitle>
              <CardDescription>
                Configure environment variables for your development environment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {envVars.map((envVar, index) => (
                <div
                  key={`env-${index}-${envVar.key}`}
                  className="flex items-center space-x-2"
                >
                  <div className="flex-1">
                    <Input
                      placeholder="VARIABLE_NAME"
                      value={envVar.key}
                      onChange={(e) =>
                        updateEnvVar(index, "key", e.target.value)
                      }
                      className="mb-2"
                    />
                  </div>
                  <div className="flex-1 relative">
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
                      className="mb-2 pr-20"
                    />
                    {envVar.isSecret && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                        onClick={() => toggleSecretVisibility(index)}
                      >
                        {showSecrets[index] ? (
                          <EyeOff className="h-4 w-4 text-gray-500" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-500" />
                        )}
                      </Button>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEnvVar(index)}
                    className="mb-2"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={addEnvVar}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" /> Add Environment Variable
              </Button>

              {selectedBundleData &&
                selectedBundleData.requiredEnvVars.length > 0 && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-900">
                          Required Variables
                        </p>
                        <p className="text-sm text-blue-700 mt-1">
                          The following environment variables are required for
                          this bundle:
                        </p>
                        <ul className="text-sm text-blue-700 mt-2 space-y-1">
                          {selectedBundleData.requiredEnvVars.map((varName) => (
                            <li key={varName} className="flex items-center">
                              <code className="bg-blue-100 px-1 rounded text-xs mr-2">
                                {varName}
                              </code>
                              {varName === "ANTHROPIC_API_KEY" && (
                                <span className="text-xs">
                                  - Get from console.anthropic.com
                                </span>
                              )}
                              {varName === "NEXTAUTH_SECRET" && (
                                <span className="text-xs">
                                  - Random string for session encryption
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>
        </div>

        {/* Summary Sidebar */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
              <CardDescription>
                Review your selections before creating your pod
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-700">
                  Pod Name
                </Label>
                <p className="text-sm text-gray-900 mt-1">
                  {podName || "Not set"}
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">
                  Project
                </Label>
                <p className="text-sm text-gray-900 mt-1">
                  {setupType === "repository"
                    ? selectedRepo
                    : `${selectedOrg}/${newRepoName}`}
                </p>
              </div>

              {selectedBundleData && (
                <>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">
                      Bundle
                    </Label>
                    <p className="text-sm text-gray-900 mt-1">
                      {selectedBundleData.name}
                    </p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">
                      Resources
                    </Label>
                    <div className="text-sm text-gray-900 mt-1 space-y-1">
                      <div className="flex items-center">
                        <Cpu className="h-4 w-4 text-gray-500 mr-2" />
                        <span>{selectedBundleData.cpuCores} vCPU</span>
                      </div>
                      <div className="flex items-center">
                        <HardDrive className="h-4 w-4 text-gray-500 mr-2" />
                        <span>{selectedBundleData.memoryGb}GB RAM</span>
                      </div>
                      <div className="flex items-center">
                        <HardDrive className="h-4 w-4 text-gray-500 mr-2" />
                        <span>{selectedBundleData.storageGb}GB Storage</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-gray-700">
                    Estimated Cost
                  </Label>
                  <div className="text-right">
                    <p className="text-lg font-bold text-blue-600">
                      ${selectedBundleData?.pricePerMonth || 0}/month
                    </p>
                    <p className="text-xs text-gray-500">
                      Billed hourly based on usage
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handleSubmit}
            disabled={!canCreate() || isCreating}
            className="w-full mt-4"
          >
            {isCreating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <>
                Create Pod
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
