"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import React, { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import {
  DEFAULT_ENV_CONTENT,
  type DotenvValidationResult,
} from "../../lib/dotenv";
import type { PinacleConfig } from "../../lib/pod-orchestration/pinacle-config";
import { parsePinacleConfig } from "../../lib/pod-orchestration/pinacle-config";
import {
  isTierAtOrAbove,
  RESOURCE_TIERS,
  type TierId,
} from "../../lib/pod-orchestration/resource-tier-registry";
import type { ServiceId } from "../../lib/pod-orchestration/service-registry";
import {
  getCodingAssistantByUrlParam,
  isCodingAssistant,
} from "../../lib/pod-orchestration/service-registry";
import { getTemplateUnsafe } from "../../lib/pod-orchestration/template-registry";
import { getServerDisplayStatus } from "../../lib/server-status";
import { api } from "../../lib/trpc/client";
import type { GitHubOrg, GitHubRepo, SetupFormValues } from "../../types/setup";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { TooltipProvider } from "../ui/tooltip";
import { ConfigurationSummary } from "./configuration-summary";
import { EnvironmentVariables } from "./environment-variables";
import { RepositorySelector } from "./repository-selector";
import { ServiceCustomizer } from "./service-customizer";
import { TemplateSelector } from "./template-selector";
import { TierSelectorSetup } from "./tier-selector-setup";

type ConfigureFormProps = {
  form: UseFormReturn<SetupFormValues>;
  onSubmit: (data: SetupFormValues) => Promise<void>;
  repositories: GitHubRepo[];
  isLoadingRepositories: boolean;
  organizations: GitHubOrg[];
  installationUrl: string | null;
  isRestoringFromCheckout?: boolean;
  currency?: "usd" | "eur" | "brl";
  isCurrencyLoading?: boolean;
};

const DEFAULT_SERVICES: ServiceId[] = [
  "claude-code",
  "vibe-kanban",
  "code-server",
];

export const ConfigureForm = ({
  form,
  onSubmit,
  repositories,
  isLoadingRepositories,
  organizations,
  installationUrl,
  isRestoringFromCheckout = false,
  currency = "usd",
  isCurrencyLoading = false,
}: ConfigureFormProps) => {
  const t = useTranslations("setup");
  // Dotenv format content (free text with comments)
  const [dotenvContent, setDotenvContent] = useState(`# Environment Variables
# Add your environment variables below

`);
  const [defaultDotenvContent, setDefaultDotenvContent] = useState("");
  const [envValidation, setEnvValidation] = useState<DotenvValidationResult>({
    valid: true,
    errors: [],
  });
  const [isCreating, setIsCreating] = useState(false);
  const [customServices, setCustomServices] =
    useState<ServiceId[]>(DEFAULT_SERVICES);
  const [pinacleConfig, setPinacleConfig] = useState<PinacleConfig | null>(
    null,
  );
  const [hasPinacleYaml, setHasPinacleYaml] = useState(false);

  // Track if we should skip applying pinacle.yaml once after checkout restoration
  const skipNextPinacleApply = React.useRef<boolean>(
    // biome-ignore lint/suspicious/noExplicitAny: meh
    (window as any).__skipNextPinacleApply || false,
  );

  // Sync ref with window global on mount
  React.useEffect(() => {
    // biome-ignore lint/suspicious/noExplicitAny: meh
    if ((window as any).__skipNextPinacleApply) {
      skipNextPinacleApply.current = true;
    }
  }, []);

  // Sync customServices state from form when restoring from checkout
  const formCustomServices = form.watch("customServices");
  React.useEffect(() => {
    if (
      isRestoringFromCheckout &&
      formCustomServices &&
      Array.isArray(formCustomServices)
    ) {
      console.log(
        "[ConfigureForm] Syncing customServices from form:",
        formCustomServices,
      );
      setCustomServices(formCustomServices as ServiceId[]);
    }
  }, [isRestoringFromCheckout, formCustomServices]);

  const setupType = form.watch("setupType");
  const selectedRepo = form.watch("selectedRepo");
  const selectedOrg = form.watch("selectedOrg");
  const newRepoName = form.watch("newRepoName");
  const bundle = form.watch("bundle");
  const tier = form.watch("tier");
  const agent = form.watch("agent");
  const serverId = form.watch("serverId");

  // Check if user is admin (server-side check)
  const { data: adminCheck } = api.admin.isAdmin.useQuery();
  const isAdmin = adminCheck?.isAdmin || false;

  // Fetch available servers for admin
  const { data: servers } = api.admin.getAllServers.useQuery(undefined, {
    enabled: isAdmin,
  });

  // Get the default branch for the selected repo
  const selectedRepoData = repositories.find(
    (repo) => repo.full_name === selectedRepo,
  );
  const defaultBranch = selectedRepoData?.default_branch || "main";

  // Always fetch pinacle.yaml when a repository is selected (don't block the query)
  const { data: pinacleConfigData, isLoading: isLoadingPinacleConfig } =
    api.githubApp.getPinacleConfig.useQuery(
      {
        repository: selectedRepo || "",
        branch: defaultBranch,
      },
      {
        enabled: setupType === "repository" && !!selectedRepo,
        retry: false,
      },
    );

  // Get selected template data
  const selectedTemplate = bundle ? getTemplateUnsafe(bundle) : undefined;

  // Get selected tier or use template's default tier
  const selectedTier = tier || selectedTemplate?.tier || "dev.small";
  const tierData = RESOURCE_TIERS[selectedTier];

  const projectName: string =
    setupType === "repository"
      ? selectedRepo || ""
      : `${selectedOrg || ""}/${newRepoName || ""}`;

  // Clear pinacle.yaml state when switching to "New Repository" or when repo is deselected
  React.useEffect(() => {
    // Clear pinacle.yaml state for new repos or when no repo is selected
    if (setupType === "new" || (setupType === "repository" && !selectedRepo)) {
      // If we had pinacle yaml before, clear everything
      if (hasPinacleYaml) {
        setHasPinacleYaml(false);
        setPinacleConfig(null);
        form.setValue("hasPinacleYaml", false);
        form.setValue("bundle", "");
        form.clearErrors("bundle");
        // Also clear process config that came from pinacle.yaml
        form.setValue("processInstallCommand", "");
        form.setValue("processStartCommand", "");
        form.setValue("processAppUrl", "");
        // Clear tabs and processes
        form.setValue("tabs", undefined);
        form.setValue("processes", undefined);
      }
    }
  }, [setupType, selectedRepo, hasPinacleYaml, form]);

  // Parse and apply pinacle.yaml config when fetched
  React.useEffect(() => {
    // Skip applying pinacle.yaml ONCE after checkout restoration to preserve custom selections
    if (skipNextPinacleApply.current && pinacleConfigData?.found) {
      console.log(
        "[ConfigureForm] Skipping pinacle.yaml application after checkout restore",
      );
      skipNextPinacleApply.current = false;
      // biome-ignore lint/suspicious/noExplicitAny: meh
      (window as any).__skipNextPinacleApply = false;

      // Still mark that pinacle.yaml exists and set the template, but don't apply values
      setHasPinacleYaml(true);
      form.setValue("bundle", "pinacle-yaml"); // Set template so validation passes
      form.setValue("hasPinacleYaml", true);

      if (pinacleConfigData.content) {
        try {
          const config = parsePinacleConfig(pinacleConfigData.content);
          setPinacleConfig(config);
        } catch (error) {
          console.error("[ConfigureForm] Failed to parse pinacle.yaml:", error);
        }
      }
      return;
    }

    if (pinacleConfigData?.found && pinacleConfigData.content) {
      try {
        const config = parsePinacleConfig(pinacleConfigData.content);
        setPinacleConfig(config);
        setHasPinacleYaml(true);

        // Set the flag in the form so it gets passed to backend
        form.setValue("hasPinacleYaml", true);

        // Use the template from pinacle.yaml if it exists, otherwise use a blank template
        const templateToUse = config.template || "nodejs-blank";
        form.setValue("bundle", templateToUse);
        form.clearErrors("bundle");

        // Set tier from config
        if (config.tier) {
          form.setValue("tier", config.tier);
        }

        // Set services from config
        if (config.services) {
          setCustomServices(config.services as ServiceId[]);
          form.setValue("customServices", config.services);
        }

        // Set tabs from config
        if (config.tabs) {
          form.setValue("tabs", config.tabs);
        }

        // Set install command
        if (config.install) {
          const installCmd =
            typeof config.install === "string"
              ? config.install
              : config.install.join(" && ");
          form.setValue("processInstallCommand", installCmd);
        }

        // Set full processes array to preserve all fields (including healthCheck)
        if (config.processes && config.processes.length > 0) {
          form.setValue("processes", config.processes);

          // Also set simplified form fields for UI display
          const firstProcess = config.processes[0];
          const startCmd =
            typeof firstProcess.startCommand === "string"
              ? firstProcess.startCommand
              : firstProcess.startCommand.join(" && ");
          form.setValue("processStartCommand", startCmd);
          if (firstProcess.url) {
            form.setValue("processAppUrl", firstProcess.url);
          }
        }
      } catch (error) {
        console.error("Failed to parse pinacle.yaml:", error);
        // If parsing fails, just continue without the config
        setHasPinacleYaml(false);
        setPinacleConfig(null);
      }
    } else if (setupType === "repository" && selectedRepo) {
      // No pinacle.yaml found for the selected repo
      setHasPinacleYaml(false);
      setPinacleConfig(null);
      form.setValue("hasPinacleYaml", false);
    }
  }, [pinacleConfigData, form, setupType, selectedRepo]);

  // Auto-select first org for "new" mode
  React.useEffect(() => {
    if (setupType === "new" && organizations.length > 0 && !selectedOrg) {
      form.setValue("selectedOrg", organizations[0].login);
    }
  }, [setupType, organizations, selectedOrg, form]);

  // Initialize services with agent from URL before template is selected
  React.useEffect(() => {
    // Skip during checkout restoration to preserve user's custom selections
    if (isRestoringFromCheckout) return;

    const selectedCodingAssistant = agent
      ? getCodingAssistantByUrlParam(agent)
      : undefined;
    if (selectedCodingAssistant && !selectedTemplate) {
      setCustomServices((prev) => {
        const withoutCodingAssistant = prev.filter(
          (service) => !isCodingAssistant(service),
        );
        return [selectedCodingAssistant, ...withoutCodingAssistant];
      });
    }
  }, [agent, selectedTemplate, isRestoringFromCheckout]);

  // Clear template selection if switching to "repository" mode with non-blank template
  // But preserve pinacle-yaml if we have a config
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only want to run when setupType changes
  React.useEffect(() => {
    if (setupType === "repository" && bundle) {
      const isBlankTemplate =
        bundle === "nodejs-blank" ||
        bundle === "python-blank" ||
        bundle === "pinacle-yaml";
      if (!isBlankTemplate) {
        form.setValue("bundle", "");
        form.clearErrors("bundle");
        setDotenvContent(""); // Clear environment variables too
        setDefaultDotenvContent("");
      }
    }
  }, [setupType]);

  // Initialize environment variables and services when bundle changes
  React.useEffect(() => {
    // Skip during checkout restoration to preserve user's custom selections
    if (isRestoringFromCheckout) return;

    if (selectedTemplate) {
      // Get dotenv content from template or use default
      const generatedDotenv = selectedTemplate.generateDefaultEnv
        ? selectedTemplate.generateDefaultEnv()
        : DEFAULT_ENV_CONTENT;
      setDotenvContent(generatedDotenv);
      setDefaultDotenvContent(generatedDotenv);

      // Auto-bump tier if current selection is below template's minimum
      const currentTier = (tier || "dev.small") as TierId;
      const templateMinTier = (selectedTemplate.tier || "dev.small") as TierId;
      if (!isTierAtOrAbove(currentTier, templateMinTier)) {
        form.setValue("tier", templateMinTier);
      }

      // Intelligently merge template services with current selection
      setCustomServices((currentServices) => {
        // 1. Preserve the currently selected coding assistant
        const currentCodingAssistant = currentServices.find((service) =>
          isCodingAssistant(service),
        );

        // Get coding assistant from URL param if no current selection
        const selectedCodingAssistant =
          currentCodingAssistant ||
          (agent ? getCodingAssistantByUrlParam(agent) : undefined);

        // 2. Get non-coding-assistant services from template
        const templateNonCodingServices = selectedTemplate.services.filter(
          (service) => !isCodingAssistant(service),
        );

        // 3. Get non-coding-assistant services from current selection
        const currentNonCodingServices = currentServices.filter(
          (service) => !isCodingAssistant(service),
        );

        // 4. Merge: add template services that aren't in current, remove current services not in template
        const mergedNonCodingServices = [
          ...new Set([
            ...templateNonCodingServices,
            ...currentNonCodingServices.filter((service) =>
              templateNonCodingServices.includes(service),
            ),
          ]),
        ];

        // 5. Combine coding assistant + merged non-coding services
        const newServices = selectedCodingAssistant
          ? [selectedCodingAssistant, ...mergedNonCodingServices]
          : mergedNonCodingServices;

        return newServices;
      });

      form.setValue("bundle", selectedTemplate.id);
    }
  }, [selectedTemplate, form, agent, isRestoringFromCheckout, tier]);

  const handleSubmit = async (data: SetupFormValues) => {
    // Validate env vars before submission
    if (!envValidation.valid) {
      const firstError = envValidation.errors[0];
      form.setError("envVars", {
        type: "manual",
        message: `Line ${firstError.line}: ${firstError.message}`,
      });
      return;
    }

    setIsCreating(true);

    try {
      // Store dotenv content directly (backend will handle parsing)
      // Using envVars field but storing the raw dotenv content
      // We pass a special marker to indicate dotenv format
      data.envVars = { __dotenv_content__: dotenvContent };
      data.customServices = customServices;

      await onSubmit(data);
    } catch (error) {
      console.error("Failed to create pod:", error);
      setIsCreating(false);
    }
  };

  const onFormSubmit = () => {
    // Clear any previous env var errors before validation
    form.clearErrors("envVars");

    // Manually trigger form validation
    form.handleSubmit(handleSubmit)();
  };

  return (
    <TooltipProvider delayDuration={200}>
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
                {t("back")}
              </Link>
            </Button>
            <h1 className="text-2xl font-mono font-bold text-slate-900">
              {t("configureYourPod")}
            </h1>
          </div>

          <div className="space-y-6">
            {/* Repository Selection */}
            <RepositorySelector
              form={form}
              repositories={repositories}
              isLoadingRepositories={isLoadingRepositories}
              organizations={organizations}
              installationUrl={installationUrl}
            />

            {/* Service Customization */}
            <ServiceCustomizer
              defaultServices={DEFAULT_SERVICES}
              selectedServices={customServices}
              onChange={(services) => {
                setCustomServices(services);
                form.setValue("customServices", services);
              }}
            />

            {/* Template Selection */}
            <div>
              <Label className="text-xs font-mono font-medium text-slate-600 mb-3 block">
                {t("selectTemplate")}
              </Label>
              {form.formState.errors.bundle?.message && (
                <p className="text-red-500 text-xs mb-2 font-mono">
                  {form.formState.errors.bundle.message}
                </p>
              )}
              {isLoadingPinacleConfig &&
                setupType === "repository" &&
                selectedRepo && (
                  <p className="text-xs font-mono text-slate-500 mb-2">
                    {t("checkingPinacleYaml")}
                  </p>
                )}
              <TemplateSelector
                selectedTemplate={bundle}
                onTemplateChange={(templateId) => {
                  form.setValue("bundle", templateId);
                  form.clearErrors("bundle");

                  // If user is selecting the pinacle.yaml option, reload its config
                  if (
                    hasPinacleYaml &&
                    pinacleConfig &&
                    templateId === (pinacleConfig.template || "nodejs-blank")
                  ) {
                    // Reload pinacle.yaml configuration
                    if (pinacleConfig.tier) {
                      form.setValue("tier", pinacleConfig.tier);
                    }
                    if (pinacleConfig.services) {
                      setCustomServices(pinacleConfig.services as ServiceId[]);
                    }
                    if (pinacleConfig.install) {
                      const installCmd =
                        typeof pinacleConfig.install === "string"
                          ? pinacleConfig.install
                          : pinacleConfig.install.join(" && ");
                      form.setValue("processInstallCommand", installCmd);
                    }
                    if (
                      pinacleConfig.processes &&
                      pinacleConfig.processes.length > 0
                    ) {
                      const firstProcess = pinacleConfig.processes[0];
                      const startCmd =
                        typeof firstProcess.startCommand === "string"
                          ? firstProcess.startCommand
                          : firstProcess.startCommand.join(" && ");
                      form.setValue("processStartCommand", startCmd);
                      if (firstProcess.url) {
                        form.setValue("processAppUrl", firstProcess.url);
                      }
                    }
                    return;
                  }

                  // Pre-fill process config based on template
                  const template = getTemplateUnsafe(templateId);
                  if (template && setupType === "repository") {
                    // Convert installCommand to string
                    const installCmd = template.installCommand
                      ? typeof template.installCommand === "string"
                        ? template.installCommand
                        : template.installCommand.join(" && ")
                      : "";
                    form.setValue("processInstallCommand", installCmd);

                    if (template.defaultProcesses?.[0]) {
                      const process = template.defaultProcesses[0];
                      form.setValue(
                        "processStartCommand",
                        typeof process.startCommand === "string"
                          ? process.startCommand
                          : process.startCommand.join(" && "),
                      );
                      if (process.url) {
                        form.setValue("processAppUrl", process.url);
                      }
                    }
                  }
                }}
                compact={true}
                showOnlyBlank={setupType === "repository"}
                pinacleConfig={hasPinacleYaml ? pinacleConfig : undefined}
              />
            </div>

            {/* Process Configuration (for existing repos) */}
            {setupType === "repository" &&
              (bundle === "pinacle-yaml" || selectedTemplate) && (
                <>
                  <Label className="text-xs font-mono font-medium text-slate-600 mb-3 block">
                    {t("applicationConfiguration")}
                  </Label>

                  <div className="bg-white p-6 rounded-lg border-2 border-slate-200 space-y-4">
                    {/* Install Command */}
                    <div>
                      <Label
                        htmlFor="processInstallCommand"
                        className="text-xs font-mono text-slate-700 mb-2 block"
                      >
                        {t("installCommand")}
                      </Label>
                      <input
                        id="processInstallCommand"
                        type="text"
                        placeholder={t("installCommandPlaceholder")}
                        value={form.watch("processInstallCommand") || ""}
                        onChange={(e) =>
                          form.setValue("processInstallCommand", e.target.value)
                        }
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>

                    {/* Start Command */}
                    <div>
                      <Label
                        htmlFor="processStartCommand"
                        className="text-xs font-mono text-slate-700 mb-2 block"
                      >
                        {t("startCommand")}
                      </Label>
                      <input
                        id="processStartCommand"
                        type="text"
                        placeholder={t("startCommandPlaceholder")}
                        value={form.watch("processStartCommand") || ""}
                        onChange={(e) =>
                          form.setValue("processStartCommand", e.target.value)
                        }
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>

                    {/* App URL */}
                    <div>
                      <Label
                        htmlFor="processAppUrl"
                        className="text-xs font-mono text-slate-700 mb-2 block"
                      >
                        {t("applicationUrl")}
                      </Label>
                      <input
                        id="processAppUrl"
                        type="text"
                        placeholder={t("applicationUrlPlaceholder")}
                        value={form.watch("processAppUrl") || ""}
                        onChange={(e) =>
                          form.setValue("processAppUrl", e.target.value)
                        }
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </>
              )}

            {/* Resource Tier Selection */}
            <div>
              <Label className="text-xs font-mono font-medium text-slate-600 mb-3 block">
                {t("computeResources")}
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
                currency={currency}
                isCurrencyLoading={isCurrencyLoading}
                minimumTier={(selectedTemplate?.tier || "dev.small") as TierId}
              />
            </div>

            {/* Server Selection (Admin Only) */}
            {isAdmin && servers && servers.length > 0 && (
              <div>
                <Label className="text-xs font-mono font-medium text-slate-600 mb-3 block">
                  {t("serverAdminOnly")}
                </Label>
                <select
                  value={serverId || ""}
                  onChange={(e) =>
                    form.setValue("serverId", e.target.value || undefined)
                  }
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="">{t("autoAssign")}</option>
                  {servers.map((server) => {
                    const displayStatus = getServerDisplayStatus(
                      server.status,
                      server.lastHeartbeatAt,
                    );
                    return (
                      <option key={server.id} value={server.id}>
                        {server.hostname} ({server.ipAddress}) - {displayStatus}
                      </option>
                    );
                  })}
                </select>
                <p className="text-xs font-mono text-slate-500 mt-2">
                  {t("serverSelectionNote")}
                </p>
              </div>
            )}

            {/* Environment Variables */}
            <div>
              <EnvironmentVariables
                value={dotenvContent}
                onChange={setDotenvContent}
                onValidationChange={setEnvValidation}
                defaultValue={defaultDotenvContent}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Summary */}
      <ConfigurationSummary
        projectName={projectName}
        selectedTemplate={selectedTemplate}
        tierData={tierData}
        onSubmit={onFormSubmit}
        isCreating={isCreating}
        selectedServices={customServices}
      />
      </div>
    </TooltipProvider>
  );
};
