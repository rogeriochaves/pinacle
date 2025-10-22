"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
    },
  });

  // Check GitHub token validity
  const { data: tokenValidation } = api.github.checkTokenValidity.useQuery(
    undefined,
    {
      enabled: status === "authenticated" && !!session?.user?.githubAccessToken,
      retry: false,
    },
  );

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
      tier: tier, // Backend derives CPU/memory/storage from tier
      customServices: selectedTemplate.services, // Send services at root level
      envVars: data.envVars,
    });

    // Redirect to provisioning page to watch progress
    router.push(`/pods/${pod.id}/provisioning`);
  };

  if (status === "loading" || installationsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-orange-500" />
          <h2 className="text-xl font-semibold text-white mb-2 font-mono">
            Loading your repositories...
          </h2>
          <p className="text-slate-400 font-mono">Just a moment</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Token Expiration Warning Banner */}
      {tokenValidation && !tokenValidation.valid && (
        <div className="bg-orange-500/10 border-b border-orange-500/30">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-orange-500/20 p-2 rounded">
                  <svg
                    className="w-5 h-5 text-orange-500"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-mono text-sm font-semibold">
                    GitHub Authentication Expired
                  </p>
                  <p className="text-orange-100 font-mono text-xs">
                    Your GitHub credentials have expired. Please sign out and sign in again.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/api/auth/signout?callbackUrl=/auth/signin";
                }}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-mono text-xs font-semibold rounded transition-colors"
              >
                Sign Out & Re-authenticate
              </button>
            </div>
          </div>
        </div>
      )}
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
