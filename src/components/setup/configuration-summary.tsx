"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import Image from "next/image";
import { formatCurrency } from "../../lib/currency-utils";
import {
  PRICING_TABLE,
  type RESOURCE_TIERS,
} from "../../lib/pod-orchestration/resource-tier-registry";
import type { ServiceId } from "../../lib/pod-orchestration/service-registry";
import { SERVICE_TEMPLATES } from "../../lib/pod-orchestration/service-registry";
import type { getTemplateUnsafe } from "../../lib/pod-orchestration/template-registry";
import { api } from "../../lib/trpc/client";
import { Button } from "../ui/button";

type ConfigurationSummaryProps = {
  projectName: string;
  selectedTemplate: ReturnType<typeof getTemplateUnsafe> | undefined;
  tierData: (typeof RESOURCE_TIERS)[keyof typeof RESOURCE_TIERS];
  onSubmit: () => void;
  isCreating: boolean;
  selectedServices?: ServiceId[];
};

const CODING_ASSISTANTS: ServiceId[] = [
  "claude-code",
  "openai-codex",
  "cursor-cli",
  "gemini-cli",
];

export const ConfigurationSummary = ({
  projectName,
  selectedTemplate,
  tierData,
  onSubmit,
  isCreating,
  selectedServices,
}: ConfigurationSummaryProps) => {
  // Detect currency from IP using tRPC
  const { data: currencyData, isLoading: isCurrencyLoading } = api.currency.detectCurrency.useQuery();
  const currency = currencyData?.currency || "usd";

  // Get pricing for the selected tier in the detected currency
  const tierPrice =
    PRICING_TABLE[tierData.id as keyof typeof PRICING_TABLE]?.[currency] ||
    tierData.price;

  // Use selectedServices if provided, otherwise fall back to template's default services
  const allServices: ServiceId[] = (selectedServices ||
    selectedTemplate?.services ||
    []) as ServiceId[];

  // Sort services to always show coding assistant first (create a copy to avoid mutation)
  const servicesToDisplay = [...allServices].sort((a, b) => {
    const aIsCodingAssistant = CODING_ASSISTANTS.includes(a);
    const bIsCodingAssistant = CODING_ASSISTANTS.includes(b);

    if (aIsCodingAssistant && !bIsCodingAssistant) return -1;
    if (!aIsCodingAssistant && bIsCodingAssistant) return 1;
    return 0; // Keep original order for non-coding assistants
  });

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
              {/* Project */}
              {projectName && !projectName.endsWith("/") && (
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
              )}

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

              {/* Tools */}
              {servicesToDisplay.length > 0 && (
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
                    <p className="text-slate-300 font-mono text-xs mb-2">
                      Tools
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        servicesToDisplay
                          .filter(
                            (serviceName) => serviceName !== "web-terminal",
                          )
                          .map((serviceName) => SERVICE_TEMPLATES[serviceName])
                          .filter((service) => service.icon) as Array<{
                          name: string;
                          displayName: string;
                          icon: string;
                          iconAlt?: string;
                        }>
                      ).map((service) => (
                        <div
                          key={service.name}
                          className="flex items-center gap-1.5 bg-slate-800 rounded px-2 py-1"
                        >
                          <Image
                            src={
                              service.icon === "/logos/vibe-kanban.svg"
                                ? "/logos/vibe-kanban-white.svg"
                                : service.icon === "/logos/openai.svg"
                                  ? "/logos/openai-white.svg"
                                  : service.icon
                            }
                            alt={service.iconAlt || service.displayName}
                            width={14}
                            height={14}
                            className="shrink-0"
                          />
                          <span className="text-white font-mono text-xs">
                            {service.displayName}
                          </span>
                        </div>
                      ))}
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
                {isCurrencyLoading ? (
                  <span className="text-white font-mono text-3xl font-bold">
                    ...
                  </span>
                ) : (
                  <span className="text-white font-mono text-3xl font-bold">
                    {formatCurrency(tierPrice, currency, { showDecimals: false })}
                  </span>
                )}
                <span className="text-slate-400 font-mono text-sm">/month</span>
              </div>
              <p className="text-slate-500 font-mono text-xs mt-1">
                Billed hourly based on usage
              </p>
            </div>

            {/* Create Button */}
            <Button
              onClick={onSubmit}
              disabled={isCreating}
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
