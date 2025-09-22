"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "../../lib/trpc/client";
import type { SetupType } from "../../types/setup";
import { ConfigureStep } from "./steps/configure-step";
import { ProjectSelectionStep } from "./steps/project-selection-step";

const setupFormSchema = z.object({
  setupType: z.enum(["repository", "new"]),
  selectedRepo: z.string().optional(),
  selectedOrg: z.string().optional(),
  newRepoName: z.string().optional(),
  podName: z.string().min(1, "Pod name is required"),
  bundle: z.string().min(1, "Bundle selection is required"),
  envVars: z.record(z.string(), z.string()),
});

type SetupFormValues = z.infer<typeof setupFormSchema>;

const SetupForm = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState<"project" | "configure">("project");

  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupFormSchema),
    defaultValues: {
      setupType: "repository",
      selectedRepo: "",
      selectedOrg: "",
      newRepoName: "",
      podName: "",
      bundle: "",
      envVars: {},
    },
  });

  // GitHub App queries
  const { data: installationData, isLoading: installationsLoading } = api.githubApp.getInstallations.useQuery();
  const { data: installationUrl } = api.githubApp.getInstallationUrl.useQuery({
    returnTo: `/setup/project?type=${form.watch("setupType")}`,
  });
  const { data: appRepositories = [] } = api.githubApp.getRepositoriesFromInstallations.useQuery(undefined, {
    enabled: installationData?.hasInstallations,
  });
  const { data: appAccounts = [] } = api.githubApp.getAccountsFromInstallations.useQuery(undefined, {
    enabled: installationData?.hasInstallations,
  });

  // tRPC mutations
  const { data: teams } = api.teams.getUserTeams.useQuery();
  const createPodMutation = api.pods.create.useMutation();

  // Initialize form from URL params
  useEffect(() => {
    const type = searchParams.get("type") as SetupType;
    const repo = searchParams.get("repo");
    const org = searchParams.get("org");
    const name = searchParams.get("name");
    const bundle = searchParams.get("bundle");

    if (type) {
      form.setValue("setupType", type);
    }
    if (repo) {
      form.setValue("selectedRepo", repo);
      // Infer pod name from repo
      form.setValue("podName", repo.split("/")[1]);
    }
    if (org) {
      form.setValue("selectedOrg", org);
    }
    if (name) {
      form.setValue("newRepoName", name);
      form.setValue("podName", name);
    }
    if (bundle) {
      form.setValue("bundle", bundle);
    }

    // Determine current step based on URL params
    if (repo || (org && name)) {
      setCurrentStep("configure");
    } else {
      setCurrentStep("project");
    }
  }, [searchParams, form]);

  // Auto-select organization for new projects
  useEffect(() => {
    const setupType = form.watch("setupType");
    const selectedOrg = form.watch("selectedOrg");

    if (setupType === "new" && appAccounts.length > 0 && !selectedOrg) {
      form.setValue("selectedOrg", appAccounts[0].login);
    }
  }, [appAccounts, form]);

  // Redirect if not authenticated or no GitHub App installed
  useEffect(() => {
    if (status === "loading" || installationsLoading) return;

    if (!session || !(session.user as any).githubId) { // eslint-disable-line @typescript-eslint/no-explicit-any
      router.push(`/setup?type=${form.watch("setupType")}`);
      return;
    }

    if (installationData !== undefined && !installationData.hasInstallations) {
      router.push(`/setup/install?type=${form.watch("setupType")}`);
      return;
    }
  }, [session, status, form, router, installationData, installationsLoading]);

  const handleProjectContinue = (data: Partial<SetupFormValues>) => {
    // Update form with project selection data
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        form.setValue(key as keyof SetupFormValues, value as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
    });


    // Navigate to configure step
    const setupType = form.getValues("setupType");
    if (setupType === "repository") {
      const selectedRepo = form.getValues("selectedRepo");
      const repo = appRepositories.find(r => r.full_name === selectedRepo);
      router.push(
        `/setup/configure?type=repository&repo=${encodeURIComponent(selectedRepo!)}&branch=${repo?.default_branch || "main"}`
      );
    } else {
      const selectedOrg = form.getValues("selectedOrg");
      const newRepoName = form.getValues("newRepoName");
      const selectedBundle = form.getValues("bundle");
      router.push(
        `/setup/configure?type=new&org=${encodeURIComponent(selectedOrg!)}&name=${encodeURIComponent(newRepoName!)}&bundle=${encodeURIComponent(selectedBundle!)}`
      );
    }
  };

  const handleFinalSubmit = async (data: SetupFormValues) => {
    const personalTeam = teams?.find((team) => team.role === "owner");

    if (!personalTeam) {
      throw new Error("No team found. Please contact support.");
    }

    // Get bundle configuration
    const { bundles } = await import("../../config/bundles");
    const selectedBundleData = bundles.find((b) => b.id === data.bundle);

    if (!selectedBundleData) {
      throw new Error("Invalid bundle selection");
    }

    // Create the pod (this handles repository creation internally if needed)
    await createPodMutation.mutateAsync({
      name: data.podName,
      description: `Development environment for ${data.setupType === "new" ? `${data.selectedOrg}/${data.newRepoName}` : data.selectedRepo || "project"}`,
      teamId: personalTeam.id,
      githubRepo: data.setupType === "repository" ? data.selectedRepo : undefined,
      githubBranch: "main",
      isNewProject: data.setupType === "new",
      newRepoName: data.newRepoName,
      selectedOrg: data.selectedOrg,
      tier: selectedBundleData.tier,
      cpuCores: selectedBundleData.cpuCores,
      memoryMb: selectedBundleData.memoryGb * 1024,
      storageMb: selectedBundleData.storageGb * 1024,
      envVars: data.envVars,
      config: {
        template: selectedBundleData.template,
        services: selectedBundleData.services,
      },
    });

    // Redirect to dashboard
    router.push(`/dashboard/pods`);
  };

  if (status === "loading" || installationsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin mx-auto mb-4 border-4 border-blue-600 border-t-transparent rounded-full" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Loading your GitHub repositories...
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {currentStep === "project" ? (
        <ProjectSelectionStep
          form={form}
          repositories={appRepositories}
          organizations={appAccounts.map(account => ({
            ...account,
            description: null
          }))}
          installationUrl={installationUrl ?? null}
          onContinue={handleProjectContinue}
        />
      ) : (
        <ConfigureStep
          form={form}
          onSubmit={handleFinalSubmit}
          onBack={() => {
            setCurrentStep("project");
            router.push(`/setup/project?type=${form.getValues("setupType")}`);
          }}
        />
      )}
    </div>
  );
};

export default SetupForm;
