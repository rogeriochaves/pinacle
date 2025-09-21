"use client";

import {
  ArrowLeft,
  ArrowRight,
  Code2,
  Cpu,
  Eye,
  EyeOff,
  HardDrive,
  Info,
  Kanban,
  Loader2,
  Plus,
  Terminal,
  Trash2,
  Zap,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
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

interface Bundle {
  id: string;
  name: string;
  description: string;
  tier: "dev.small" | "dev.medium" | "dev.large" | "dev.xlarge";
  template: string;
  services: string[];
  cpuCores: number;
  memoryGb: number;
  storageGb: number;
  hourlyRate: number;
  monthlyEstimate: number;
  icon: any;
  popular?: boolean;
  requiredEnvVars: string[];
}

interface EnvVar {
  key: string;
  value: string;
  isSecret: boolean;
}

const bundles: Bundle[] = [
  {
    id: "vite-small",
    name: "Vite Starter",
    description: "Perfect for frontend projects with Vite",
    tier: "dev.small",
    template: "vite",
    services: ["Claude Code", "Vibe Kanban", "Code Server", "Terminal"],
    cpuCores: 0.5,
    memoryGb: 1,
    storageGb: 10,
    hourlyRate: 0.008,
    monthlyEstimate: 6,
    icon: Code2,
    popular: true,
    requiredEnvVars: ["ANTHROPIC_API_KEY"],
  },
  {
    id: "nextjs-medium",
    name: "Next.js Pro",
    description: "Full-stack Next.js development environment",
    tier: "dev.medium",
    template: "nextjs",
    services: [
      "Claude Code",
      "Vibe Kanban",
      "Code Server",
      "Terminal",
      "Database",
    ],
    cpuCores: 1,
    memoryGb: 2,
    storageGb: 20,
    hourlyRate: 0.017,
    monthlyEstimate: 12,
    icon: Terminal,
    requiredEnvVars: ["ANTHROPIC_API_KEY", "NEXTAUTH_SECRET"],
  },
  {
    id: "custom-small",
    name: "Custom Setup",
    description: "Blank environment for custom configurations",
    tier: "dev.small",
    template: "blank",
    services: ["Claude Code", "Vibe Kanban", "Code Server", "Terminal"],
    cpuCores: 0.5,
    memoryGb: 1,
    storageGb: 10,
    hourlyRate: 0.008,
    monthlyEstimate: 6,
    icon: Kanban,
    requiredEnvVars: ["ANTHROPIC_API_KEY"],
  },
  {
    id: "power-large",
    name: "Power User",
    description: "High-performance environment for complex projects",
    tier: "dev.large",
    template: "custom",
    services: [
      "Claude Code",
      "Vibe Kanban",
      "Code Server",
      "Terminal",
      "Docker",
    ],
    cpuCores: 2,
    memoryGb: 4,
    storageGb: 40,
    hourlyRate: 0.033,
    monthlyEstimate: 24,
    icon: Zap,
    requiredEnvVars: ["ANTHROPIC_API_KEY"],
  },
];

const ConfigurePage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [setupType, setSetupType] = useState<SetupType>("repository");
  const [selectedBundle, setSelectedBundle] = useState<string>("vite-small");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [podName, setPodName] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);

  // Extract URL parameters
  const repoName = searchParams.get("repo");
  const branch = searchParams.get("branch");
  const orgName = searchParams.get("org");
  const newRepoName = searchParams.get("name");

  useEffect(() => {
    const type = searchParams.get("type") as SetupType;
    if (type === "repository" || type === "new") {
      setSetupType(type);
    }

    // Set default pod name
    if (type === "repository" && repoName) {
      const name = repoName.split("/")[1] || repoName;
      setPodName(name);
    } else if (type === "new" && newRepoName) {
      setPodName(newRepoName);
    }
  }, [searchParams, repoName, newRepoName]);

  // Initialize environment variables when bundle changes
  useEffect(() => {
    const bundle = bundles.find((b) => b.id === selectedBundle);
    if (bundle) {
      const newEnvVars = bundle.requiredEnvVars.map((key) => ({
        key,
        value: "",
        isSecret:
          key.includes("SECRET") ||
          key.includes("KEY") ||
          key.includes("TOKEN"),
      }));
      setEnvVars(newEnvVars);
    }
  }, [selectedBundle]);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "loading") return;

    if (!session || !(session.user as any).githubId) {
      router.push(`/setup?type=${setupType}`);
      return;
    }
  }, [session, status, setupType, router]);

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: "", value: "", isSecret: false }]);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
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

  const toggleSecretVisibility = (index: number) => {
    setShowSecrets((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // tRPC hooks
  const { data: teams } = api.teams.getUserTeams.useQuery();
  const createPodMutation = api.pods.create.useMutation();
  const createRepoMutation = api.github.createRepository.useMutation();

  const handleCreatePod = async () => {
    if (!canCreate() || !selectedBundleData || !session) return;

    setIsCreating(true);

    try {
      const user = session.user as any;

      // Get the user's personal team (first team they own)
      const personalTeam = teams?.find((team) => team.role === "owner");
      if (!personalTeam) {
        throw new Error("No team found. Please contact support.");
      }

      let finalGithubRepo = "";

      // Create repository if it's a new project
      if (setupType === "new" && orgName && newRepoName) {
        const newRepo = await createRepoMutation.mutateAsync({
          name: newRepoName,
          organization: orgName === user.githubUsername ? undefined : orgName,
          description: `Development project created with Pinacle`,
          private: false,
        });
        finalGithubRepo = newRepo.full_name;
      } else if (setupType === "repository" && repoName) {
        finalGithubRepo = repoName;
      }

      // Prepare environment variables
      const envVarsObject: Record<string, string> = {};
      envVars.forEach((env) => {
        if (env.key && env.value) {
          envVarsObject[env.key] = env.value;
        }
      });

      // Create the pod
      await createPodMutation.mutateAsync({
        name: podName,
        description: `Development environment for ${finalGithubRepo || "new project"}`,
        teamId: personalTeam.id,
        githubRepo: finalGithubRepo || undefined,
        githubBranch: branch || "main",
        isNewProject: setupType === "new",
        tier: selectedBundleData.tier,
        cpuCores: selectedBundleData.cpuCores,
        memoryMb: selectedBundleData.memoryGb * 1024,
        storageMb: selectedBundleData.storageGb * 1024,
        envVars: envVarsObject,
        config: {
          template: selectedBundleData.template,
          services: selectedBundleData.services,
        },
      });

      // Redirect to dashboard
      router.push(`/dashboard/pods`);
    } catch (error) {
      console.error("Failed to create pod:", error);
      // TODO: Show error message to user
    } finally {
      setIsCreating(false);
    }
  };

  const canCreate = () => {
    const bundle = bundles.find((b) => b.id === selectedBundle);
    if (!bundle) return false;

    const requiredVarsSet = bundle.requiredEnvVars.every((key) => {
      const envVar = envVars.find((ev) => ev.key === key);
      return envVar && envVar.value.trim() !== "";
    });

    return podName.trim() !== "" && requiredVarsSet;
  };

  const selectedBundleData = bundles.find((b) => b.id === selectedBundle);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Loading...
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Configure Your Pod
              </h1>
              <p className="text-gray-600 mt-1">
                {setupType === "repository"
                  ? `Setting up development environment for ${repoName}`
                  : `Creating new project: ${orgName}/${newRepoName}`}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Pod Name */}
            <Card>
              <CardHeader>
                <CardTitle>Pod Name</CardTitle>
                <CardDescription>
                  Choose a name for your development environment
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Input
                  value={podName}
                  onChange={(e) => setPodName(e.target.value)}
                  placeholder="my-awesome-pod"
                />
              </CardContent>
            </Card>

            {/* Bundle Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Development Bundle</CardTitle>
                <CardDescription>
                  Choose your development environment configuration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {bundles.map((bundle) => {
                    const Icon = bundle.icon;
                    const isSelected = selectedBundle === bundle.id;

                    return (
                      <button
                        key={bundle.id}
                        type="button"
                        className={`w-full text-left relative p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                        onClick={() => setSelectedBundle(bundle.id)}
                      >
                        {bundle.popular && (
                          <Badge className="absolute -top-2 -right-2 bg-orange-500">
                            Popular
                          </Badge>
                        )}

                        <div className="flex items-start space-x-3">
                          <Icon className="h-6 w-6 text-blue-600 mt-1" />
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 mb-1">
                              {bundle.name}
                            </h3>
                            <p className="text-sm text-gray-600 mb-3">
                              {bundle.description}
                            </p>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">
                                  Resources:
                                </span>
                                <span className="font-medium">
                                  {bundle.cpuCores} vCPU, {bundle.memoryGb}GB
                                  RAM
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">Estimate:</span>
                                <span className="font-medium text-blue-600">
                                  ${bundle.monthlyEstimate}/month
                                </span>
                              </div>
                            </div>

                            <div className="mt-3">
                              <p className="text-xs text-gray-500 mb-1">
                                Includes:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {bundle.services.map((service) => (
                                  <Badge
                                    key={service}
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {service}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Environment Variables */}
            <Card>
              <CardHeader>
                <CardTitle>Environment Variables</CardTitle>
                <CardDescription>
                  Configure environment variables for your development
                  environment
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
                          className="absolute right-8 top-0 h-10"
                          onClick={() => toggleSecretVisibility(index)}
                        >
                          {showSecrets[index] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEnvVar(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={addEnvVar}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Environment Variable
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
                            {selectedBundleData.requiredEnvVars.map(
                              (varName) => (
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
                              ),
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>
          </div>

          {/* Summary Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Configuration Summary</CardTitle>
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
                      ? repoName
                      : `${orgName}/${newRepoName}`}
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
                          <Cpu className="h-3 w-3 mr-2 text-gray-400" />
                          {selectedBundleData.cpuCores} vCPU
                        </div>
                        <div className="flex items-center">
                          <HardDrive className="h-3 w-3 mr-2 text-gray-400" />
                          {selectedBundleData.memoryGb}GB RAM
                        </div>
                        <div className="flex items-center">
                          <HardDrive className="h-3 w-3 mr-2 text-gray-400" />
                          {selectedBundleData.storageGb}GB Storage
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-gray-700">
                          Estimated Cost
                        </Label>
                        <div className="text-right">
                          <p className="text-lg font-bold text-blue-600">
                            ${selectedBundleData.monthlyEstimate}/month
                          </p>
                          <p className="text-xs text-gray-500">
                            ${selectedBundleData.hourlyRate.toFixed(3)}/hour
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Button
              onClick={handleCreatePod}
              disabled={!canCreate() || isCreating}
              className="w-full"
              size="lg"
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

            {!canCreate() && (
              <p className="text-sm text-red-600 text-center">
                Please fill in all required fields to continue
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigurePage;
