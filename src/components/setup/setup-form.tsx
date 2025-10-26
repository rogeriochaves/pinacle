"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useGitHubReauth } from "../../hooks/use-github-reauth";
import { getTemplateUnsafe } from "../../lib/pod-orchestration/template-registry";
import { api } from "../../lib/trpc/client";
import {
  type SetupFormValues,
  type SetupType,
  setupFormSchema,
} from "../../types/setup";
import { ConfigureForm } from "./configure-form";

const SetupForm = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { reauthenticate } = useGitHubReauth();

  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupFormSchema),
    mode: "onChange", // Validate on change to clear errors as user types
    defaultValues: {
      setupType: "repository",
      selectedRepo: "",
      selectedOrg: "",
      newRepoName: "",
      podName: "",
      bundle: "",
      tier: undefined,
      agent: undefined,
      envVars: {},
      processInstallCommand: "",
      processStartCommand: "",
      processAppUrl: "",
      hasPinacleYaml: false,
    },
  });

  // Check GitHub token validity in parallel with repo loading
  const { data: tokenValidation, isLoading: isCheckingToken } = api.github.checkTokenValidity.useQuery(
    undefined,
    {
      enabled: status === "authenticated" && !!session?.user?.githubAccessToken,
      retry: false,
    },
  );

  // Automatically redirect to re-auth if token is expired
  useEffect(() => {
    if (tokenValidation && !tokenValidation.valid) {
      console.log("[SetupForm] Token expired, automatically triggering re-auth...");
      reauthenticate();
    }
  }, [tokenValidation, reauthenticate]);

  // GitHub App queries
  const { data: installationData, isLoading: installationsLoading } =
    api.githubApp.getInstallations.useQuery();
  const { data: installationUrl } = api.githubApp.getInstallationUrl.useQuery({
    returnTo: `/setup/project?type=${form.watch("setupType")}`,
  });
  const { data: appRepositories = [], isLoading: isLoadingRepositories } =
    api.githubApp.getRepositoriesFromInstallations.useQuery(undefined, {
      enabled: installationData?.hasInstallations,
    });
  const { data: appAccounts = [] } =
    api.githubApp.getAccountsFromInstallations.useQuery(undefined, {
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
    const template = searchParams.get("template");
    const tier = searchParams.get("tier");
    const agent = searchParams.get("agent");

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
    // Prefer bundle param, but fall back to template param (from landing page)
    if (bundle) {
      form.setValue("bundle", bundle);
    } else if (template) {
      form.setValue("bundle", template);
    }
    // Set tier from landing page selection
    if (
      tier &&
      (tier === "dev.small" ||
        tier === "dev.medium" ||
        tier === "dev.large" ||
        tier === "dev.xlarge")
    ) {
      form.setValue("tier", tier);
    }
    // Set agent from landing page selection
    if (agent) {
      form.setValue("agent", agent);
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

    if (!session || !session.user.githubId) {
      router.push(`/setup?type=${form.watch("setupType")}`);
      return;
    }

    if (installationData !== undefined && !installationData.hasInstallations) {
      router.push(`/setup/install?type=${form.watch("setupType")}`);
      return;
    }
  }, [session, status, form, router, installationData, installationsLoading]);

  const handleFinalSubmit = async (data: SetupFormValues) => {
    const personalTeam = teams?.find((team) => team.role === "owner");

    if (!personalTeam) {
      throw new Error("No team found. Please contact support.");
    }

    // Get template configuration
    const selectedTemplate = getTemplateUnsafe(data.bundle);

    if (!selectedTemplate) {
      throw new Error("Invalid template selection");
    }

    // Get tier (use selected tier or template default)
    const tier = data.tier || selectedTemplate.tier;

    // Create the pod (name and resources auto-generated on backend)
    const pod = await createPodMutation.mutateAsync({
      description: `Development environment for ${data.setupType === "new" ? `${data.selectedOrg}/${data.newRepoName}` : data.selectedRepo || "project"}`,
      teamId: personalTeam.id,
      githubRepo:
        data.setupType === "repository" ? data.selectedRepo : undefined,
      githubBranch: undefined,
      isNewProject: data.setupType === "new",
      newRepoName: data.newRepoName,
      selectedOrg: data.selectedOrg,
      template: selectedTemplate.id,
      tier: tier, // Use form's tier selection (or template default)
      customServices: (data.customServices as typeof selectedTemplate.services) || selectedTemplate.services, // Use form's selected services
      tabs: data.tabs, // Pass tabs from existing pinacle.yaml (if any)
      envVars: data.envVars,
      // Process configuration for existing repos
      processConfig:
        data.setupType === "repository" &&
        (data.processInstallCommand ||
          data.processStartCommand ||
          data.processAppUrl)
          ? {
              installCommand: data.processInstallCommand,
              startCommand: data.processStartCommand,
              appUrl: data.processAppUrl,
            }
          : undefined,
      // Pass flag to indicate if repo already has pinacle.yaml
      hasPinacleYaml: data.hasPinacleYaml,
    });

    // Redirect to provisioning page to watch progress
    router.push(`/pods/${pod.id}/provisioning`);
  };

  // Show loading screen while:
  // 1. Session is loading
  // 2. Checking token validity
  // 3. Loading repositories
  // 4. Token is invalid (to prevent screen blink during redirect)
  const isTokenInvalid = tokenValidation && !tokenValidation.valid;
  const isLoading = status === "loading" || isCheckingToken || installationsLoading || isTokenInvalid;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-orange-500" />
          <h2 className="text-xl font-semibold text-white mb-2 font-mono">
            {isTokenInvalid ? "Refreshing authentication..." : "Loading your repositories..."}
          </h2>
          <p className="text-slate-400 font-mono">Just a moment</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <ConfigureForm
        form={form}
        onSubmit={handleFinalSubmit}
        repositories={appRepositories}
        isLoadingRepositories={isLoadingRepositories}
        organizations={appAccounts.map((account) => ({
          ...account,
          description: null,
        }))}
        installationUrl={installationUrl ?? null}
      />
    </div>
  );
};

export default SetupForm;
