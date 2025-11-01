"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useGitHubReauth } from "../../hooks/use-github-reauth";
import { getTemplateUnsafe } from "../../lib/pod-orchestration/template-registry";
import { api } from "../../lib/trpc/client";
import {
  type SetupFormValues,
  type SetupType,
  setupFormSchema,
} from "../../types/setup";
import { CheckoutStatusBanner } from "./checkout-status-banner";
import { ConfigureForm } from "./configure-form";

const SetupForm = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { reauthenticate } = useGitHubReauth();
  const [isRestoringFromCheckout, setIsRestoringFromCheckout] = useState(false);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);

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
  const checkoutStatus = searchParams.get("checkout");
  const isReturningFromCheckout = checkoutStatus === "success" || checkoutStatus === "cancel";

  const { data: appRepositories = [], isLoading: isLoadingRepositories } =
    api.githubApp.getRepositoriesFromInstallations.useQuery(undefined, {
      enabled: installationData?.hasInstallations && !isReturningFromCheckout,
    });
  const { data: appAccounts = [] } =
    api.githubApp.getAccountsFromInstallations.useQuery(undefined, {
      enabled: installationData?.hasInstallations,
    });

  // tRPC mutations
  const { data: teams, refetch: refetchTeams } = api.teams.getUserTeams.useQuery();
  const createPodMutation = api.pods.create.useMutation();

  // Initialize form from URL params
  useEffect(() => {
    // Skip if restoring from checkout
    if (isRestoringFromCheckout) return;

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
  }, [searchParams, form, isRestoringFromCheckout]);

  // Auto-select organization for new projects
  useEffect(() => {
    // Skip if restoring from checkout
    if (isRestoringFromCheckout) return;

    const setupType = form.watch("setupType");
    const selectedOrg = form.watch("selectedOrg");

    if (setupType === "new" && appAccounts.length > 0 && !selectedOrg) {
      form.setValue("selectedOrg", appAccounts[0].login);
    }
  }, [appAccounts, form, isRestoringFromCheckout]);

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

  // Query subscription status
  const { data: subscriptionStatus, refetch: refetchSubscription } = api.billing.getSubscriptionStatus.useQuery();

  // Mutation for creating checkout session
  const createCheckoutMutation = api.billing.createCheckoutSession.useMutation();

  // Mutation for handling checkout success
  const handleCheckoutSuccessMutation = api.billing.handleCheckoutSuccess.useMutation();

  // Handle checkout success/cancel from URL params
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only run on searchParams change to avoid infinite loops
  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");

    // Prevent multiple calls - check if mutation is already pending
    if (handleCheckoutSuccessMutation.isPending || createPodMutation.isPending) {
      return;
    }

    if (checkout === "success" && sessionId) {
      // Clean up URL params immediately to prevent re-triggers
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("checkout");
      newUrl.searchParams.delete("session_id");
      window.history.replaceState({}, "", newUrl.toString());

      // Set processing flag to keep loading screen visible
      setIsProcessingCheckout(true);

      // Verify the checkout session
      handleCheckoutSuccessMutation.mutate(
        { sessionId },
        {
          onSuccess: async () => {
            console.log("[Checkout] Success! Refetching subscription...");

            // Refresh subscription status and WAIT for it to complete
            const { data: updatedSubscription } = await refetchSubscription();
            console.log("[Checkout] Subscription updated:", updatedSubscription);

            // Try to restore form data and auto-create pod
            const savedFormData = sessionStorage.getItem("pendingPodConfig");
            if (savedFormData) {
              try {
                const formData = JSON.parse(savedFormData) as SetupFormValues;

                // Set flag to disable auto-detection useEffects
                setIsRestoringFromCheckout(true);

                // Restore form visually before creating pod
                console.log("[Checkout] Restoring form data:", formData);

                // If user had customized a repo with pinacle.yaml, skip applying it once after restore
                if (formData.setupType === "repository" && formData.hasPinacleYaml) {
                  console.log("[Checkout] Setting flag to skip next pinacle.yaml application");
                  (window as any).__skipNextPinacleApply = true;
                }

                form.setValue("setupType", formData.setupType);
                form.setValue("selectedRepo", formData.selectedRepo || "");
                form.setValue("selectedOrg", formData.selectedOrg || "");
                form.setValue("newRepoName", formData.newRepoName || "");
                form.setValue("podName", formData.podName || "");
                form.setValue("bundle", formData.bundle);
                form.setValue("tier", formData.tier);
                form.setValue("agent", formData.agent);
                form.setValue("customServices", formData.customServices);
                form.setValue("envVars", formData.envVars || {});
                form.setValue("processInstallCommand", formData.processInstallCommand || "");
                form.setValue("processStartCommand", formData.processStartCommand || "");
                form.setValue("processAppUrl", formData.processAppUrl || "");
                form.setValue("hasPinacleYaml", formData.hasPinacleYaml || false);
                form.setValue("tabs", formData.tabs);
                form.setValue("processes", formData.processes);

                // Give UI a moment to update, then create pod
                await new Promise(resolve => setTimeout(resolve, 500));

                sessionStorage.removeItem("pendingPodConfig");

                console.log("[Checkout] Creating pod with restored data...");
                toast.success("Payment successful! Creating your pod...");

                // Fetch teams to ensure we have the latest data
                const { data: userTeams } = await refetchTeams();
                console.log("[Checkout] Teams available:", userTeams);

                // Call create pod directly, bypassing subscription check since we just verified it
                const personalTeam = userTeams?.find((team) => team.role === "owner");
                console.log("[Checkout] Personal team:", personalTeam);

                if (!personalTeam) {
                  console.error("[Checkout] No personal team found!");
                  toast.error("No team found. Please contact support.");
                  return;
                }

                const selectedTemplate = getTemplateUnsafe(formData.bundle);
                console.log("[Checkout] Selected template:", selectedTemplate);
                if (!selectedTemplate) {
                  console.error("[Checkout] Invalid template:", formData.bundle);
                  toast.error("Invalid template selection");
                  return;
                }

                const tier = formData.tier || selectedTemplate.tier;
                console.log("[Checkout] Creating pod with tier:", tier);

                // Create the pod directly
                const pod = await createPodMutation.mutateAsync({
                  description: `Development environment for ${formData.setupType === "new" ? `${formData.selectedOrg}/${formData.newRepoName}` : formData.selectedRepo || "project"}`,
                  teamId: personalTeam.id,
                  githubRepo: formData.setupType === "repository" ? formData.selectedRepo : undefined,
                  githubBranch: undefined,
                  isNewProject: formData.setupType === "new",
                  newRepoName: formData.newRepoName,
                  selectedOrg: formData.selectedOrg,
                  template: selectedTemplate.id,
                  tier: tier,
                  customServices: (formData.customServices as typeof selectedTemplate.services) || selectedTemplate.services,
                  tabs: formData.tabs,
                  processes: formData.processes,
                  envVars: formData.envVars,
                  processConfig:
                    formData.setupType === "repository" &&
                    (formData.processInstallCommand ||
                      formData.processStartCommand ||
                      formData.processAppUrl)
                      ? {
                          installCommand: formData.processInstallCommand,
                          startCommand: formData.processStartCommand,
                          appUrl: formData.processAppUrl,
                        }
                      : undefined,
                  hasPinacleYaml: formData.hasPinacleYaml,
                });

                console.log("[Checkout] Pod created successfully!", pod);
                console.log("[Checkout] Redirecting to provisioning...");
                router.push(`/pods/${pod.id}/provisioning`);
                // Keep loading screen visible until redirect completes
              } catch (error) {
                console.error("Failed to restore form data or create pod:", error);
                const errorMessage =
                  error instanceof Error
                    ? error.message
                    : "Failed to create pod. Please try again.";
                toast.error(errorMessage);
                setIsProcessingCheckout(false); // Show form on error
              } finally {
                // Re-enable auto-detection useEffects
                setIsRestoringFromCheckout(false);
              }
            } else {
              toast.success("Payment successful! Please configure your pod.");
              setIsProcessingCheckout(false);
            }
          },
          onError: (error) => {
            console.error("Checkout verification failed:", error);
            // If payment not completed yet, subscription will be activated via webhook
            // Just refresh and let user proceed
            toast.info("Processing payment... This may take a moment.");
            void refetchSubscription();
            setIsProcessingCheckout(false); // Show form on error
          },
        },
      );
    } else if (checkout === "cancel") {
      // User cancelled checkout - clean up
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("checkout");
      window.history.replaceState({}, "", newUrl.toString());
      toast.info("Checkout cancelled");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]); // Only depend on searchParams to avoid infinite loop

  const handleFinalSubmit = async (data: SetupFormValues) => {
    try {
      // Check if user has an active subscription
      if (!subscriptionStatus?.hasSubscription || subscriptionStatus.status !== "active") {
        // Save form data to sessionStorage before redirecting to Stripe
        sessionStorage.setItem("pendingPodConfig", JSON.stringify(data));

        // Get tier for checkout
        const selectedTemplate = getTemplateUnsafe(data.bundle);
        const tier = data.tier || selectedTemplate?.tier || "dev.small";

        // Redirect to Stripe checkout
        const checkout = await createCheckoutMutation.mutateAsync({
          tierId: tier,
          currency: "usd",
          successUrl: `${window.location.origin}/setup/configure?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/setup/configure?checkout=cancel`,
        });

        // Redirect to Stripe Checkout
        window.location.href = checkout.url!;
        return;
      }

      const personalTeam = teams?.find((team) => team.role === "owner");

      if (!personalTeam) {
        toast.error("No team found. Please contact support.");
        return;
      }

      // Get template configuration
      const selectedTemplate = getTemplateUnsafe(data.bundle);

      if (!selectedTemplate) {
        toast.error("Invalid template selection");
        return;
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
        processes: data.processes, // Pass full processes from existing pinacle.yaml (preserves healthCheck)
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
    } catch (error) {
      console.error("Failed to create pod:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to create pod. Please try again.";
      toast.error(errorMessage);
    }
  };

  // Show loading screen while:
  // 1. Session is loading
  // 2. Checking token validity
  // 3. Loading repositories (unless returning from checkout)
  // 4. Token is invalid (to prevent screen blink during redirect)
  // 5. Processing checkout flow (verification + form restore + pod creation + redirect)
  const isTokenInvalid = tokenValidation && !tokenValidation.valid;
  const isLoading = status === "loading" || isCheckingToken || installationsLoading || isTokenInvalid || isProcessingCheckout;

  if (isLoading) {
    const loadingMessage = isProcessingCheckout
      ? createPodMutation.isPending
        ? "Creating your pod..."
        : "Verifying your payment..."
      : isTokenInvalid
        ? "Refreshing authentication..."
        : "Loading your repositories...";

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-orange-500" />
          <h2 className="text-xl font-semibold text-white mb-2 font-mono">{loadingMessage}</h2>
          <p className="text-slate-400 font-mono">Just a moment</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <CheckoutStatusBanner
        status={checkoutStatus as "success" | "cancel" | null}
        isVerifying={handleCheckoutSuccessMutation.isPending}
      />

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
        isRestoringFromCheckout={isRestoringFromCheckout}
      />
    </div>
  );
};

export default SetupForm;
