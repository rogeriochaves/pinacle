"use client";

import { LucideLayers } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  CODING_ASSISTANTS,
  type CodingAssistantId,
  getCodingAssistantIds,
  SERVICE_TEMPLATES,
} from "@/lib/pod-orchestration/service-registry";
import { getPublicTemplates } from "@/lib/pod-orchestration/template-registry";
import { api } from "@/lib/trpc/client";
import { TierSelector } from "../shared/tier-selector";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../ui/select";

type CodingAgent = {
  id: string;
  icon: string;
  name: string;
  alt: string;
};

// Get coding agents dynamically from service registry
const CODING_AGENTS: CodingAgent[] = getCodingAssistantIds()
  .map((assistantId: CodingAssistantId) => {
    const service = SERVICE_TEMPLATES[assistantId];
    const assistant = CODING_ASSISTANTS[assistantId];
    return {
      id: assistant.urlParamName,
      icon: service.icon || "",
      name: service.displayName,
      alt: service.iconAlt || service.displayName,
    };
  })
  .filter((agent) => agent.icon); // Only include agents with icons

type TemplateCardProps = {
  template: ReturnType<typeof getPublicTemplates>[number];
  currency: "usd" | "eur" | "brl";
  isCurrencyLoading: boolean;
};

const TemplateCard = ({
  template,
  currency,
  isCurrencyLoading,
}: TemplateCardProps) => {
  const [selectedAgent, setSelectedAgent] = useState<string>("claude");
  const [selectedTier, setSelectedTier] = useState<string>("dev.small");
  const t = useTranslations("templates");

  const selectedCodingAgent =
    CODING_AGENTS.find((agent) => agent.id === selectedAgent) ||
    CODING_AGENTS[0];

  // Get services with icons, excluding terminal (respects template order)
  const servicesWithIcons = template.services
    .filter((serviceName) => serviceName !== "web-terminal")
    .map((serviceName) => SERVICE_TEMPLATES[serviceName])
    .filter((service) => service.icon) as Array<{
    name: string;
    displayName: string;
    icon: string;
    iconAlt?: string;
  }>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono font-bold flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            {template.icon && (
              <Image
                src={template.icon}
                alt={template.iconAlt || template.name}
                width={24}
                height={24}
              />
            )}
            {template.name}
          </div>

          {template.popular && <Badge>{t("popular")}</Badge>}
        </CardTitle>
        <CardDescription>
          {template.mainUseCaseKey
            ? t(template.mainUseCaseKey.replace("templates.", ""))
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <hr className="my-4 border-gray-200" />
        <ul className="space-y-2">
          {template.techStack && (
            <li className="flex items-start gap-4">
              <LucideLayers className="w-4 h-4 min-w-4 min-h-4 mt-1" />
              {template.techStack}
            </li>
          )}
          {servicesWithIcons.map((service) => {
            // Special case for coding agent selector
            if (service.displayName === "Claude Code") {
              return (
                <li key="coding-agent" className="flex items-start gap-4">
                  <Image
                    src={selectedCodingAgent.icon}
                    alt={selectedCodingAgent.alt}
                    width={14}
                    height={14}
                    className="min-w-4 min-h-4 mt-1"
                  />
                  <Select
                    value={selectedAgent}
                    onValueChange={setSelectedAgent}
                    aria-label={t("selectCodingAssistant")}
                  >
                    <SelectTrigger className="w-auto !h-auto text-md p-0 border-none shadow-none bg-transparent gap-1 hover:bg-transparent focus:ring-0 focus:ring-offset-0 ![&>svg]:text-foreground [&>svg]:text-lg">
                      {selectedCodingAgent.name}
                    </SelectTrigger>
                    <SelectContent>
                      {CODING_AGENTS.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          <div className="flex items-center gap-2">
                            <Image
                              src={agent.icon}
                              alt={agent.alt}
                              width={14}
                              height={14}
                            />
                            {agent.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              );
            }

            return (
              <li key={service.name} className="flex items-start gap-4">
                <Image
                  src={service.icon}
                  alt={service.iconAlt || service.displayName}
                  width={14}
                  height={14}
                  className="min-w-4 min-h-4 mt-1"
                />
                {service.displayName}
              </li>
            );
          })}
        </ul>
      </CardContent>
      <CardFooter className="flex-col w-full">
        <hr className="my-4 border-gray-200" />
        <div className="flex items-start justify-between w-full gap-4">
          <TierSelector
            value={selectedTier}
            onChange={setSelectedTier}
            compact
            currency={currency}
            isLoading={isCurrencyLoading}
            ariaLabel={t("selectTier")}
          />
          <Link
            href={`/setup?type=new&template=${template.id}&tier=${selectedTier}&agent=${selectedAgent}`}
          >
            <Button variant="accent" className="w-full">
              {t("startBuilding")}
            </Button>
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
};

export const Templates = () => {
  const templates = getPublicTemplates().slice(0, 6);
  const t = useTranslations("templates");

  // Detect currency from IP using tRPC
  const { data: currencyData, isLoading: isCurrencyLoading } =
    api.currency.detectCurrency.useQuery();
  const currency = currencyData?.currency || "usd";

  return (
    <section className="bg-slate-100 py-12 sm:py-12 px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h2 className="text-xl font-bold font-mono tracking-tight text-foreground sm:text-2xl">
            {t("title")}
          </h2>
          <p className="mt-2 text-md leading-8 text-muted-foreground font-mono">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              currency={currency}
              isCurrencyLoading={isCurrencyLoading}
            />
          ))}
        </div>
        <div className="mt-10 flex justify-end">
          <Link href="/setup?type=new&template=nodejs-blank&tier=dev.small">
            <Button>{t("customSetup")}</Button>
          </Link>
        </div>
      </div>
    </section>
  );
};
