"use client";

import { LucideLayers } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { RESOURCE_TIERS } from "@/lib/pod-orchestration/resource-tier-registry";
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

type Tool = {
  icon: string;
  name: string;
  alt: string;
};

type Template = {
  id: string;
  icon: string;
  iconAlt: string;
  title: string;
  techStack: string;
  mainUseCase: string;
  tools: Tool[];
  price: number;
  badge?: string;
};

type CodingAgent = {
  id: string;
  icon: string;
  name: string;
  alt: string;
};

const CODING_AGENTS: CodingAgent[] = [
  {
    id: "claude",
    icon: "/logos/claude.svg",
    name: "Claude Code",
    alt: "Claude",
  },
  {
    id: "openai",
    icon: "/logos/openai.svg",
    name: "OpenAI Codex",
    alt: "OpenAI",
  },
  {
    id: "cursor",
    icon: "/logos/cursor.svg",
    name: "Cursor CLI",
    alt: "Cursor",
  },
  {
    id: "gemini",
    icon: "/logos/gemini.svg",
    name: "Gemini CLI",
    alt: "Gemini",
  },
];

const TEMPLATES: Template[] = [
  {
    id: "vite",
    icon: "/logos/vite.svg",
    iconAlt: "Vite",
    title: "Vite Template",
    techStack: "React, TypeScript, Tailwind CSS",
    mainUseCase: "For building websites",
    tools: [
      { icon: "/logos/claude.svg", name: "Claude Code", alt: "Claude" },
      { icon: "/logos/vibe-kanban.svg", name: "Vibe Kanban", alt: "Vibe" },
      { icon: "/logos/vscode.svg", name: "VS Code", alt: "VS Code" },
    ],
    price: 6,
    badge: "Popular",
  },
  {
    id: "nextjs-t3",
    icon: "/logos/nextjs.svg",
    iconAlt: "Next.js",
    title: "Next.js T3 Stack",
    techStack: "React, TypeScript, Tailwind CSS, NextAuth, PostgreSQL, tRPC",
    mainUseCase: "For building SaaS applications",
    tools: [
      { icon: "/logos/claude.svg", name: "Claude Code", alt: "Claude" },
      { icon: "/logos/vibe-kanban.svg", name: "Vibe Kanban", alt: "Vibe" },
      { icon: "/logos/vscode.svg", name: "VS Code", alt: "VS Code" },
    ],
    price: 6,
  },
  {
    id: "agno",
    icon: "/logos/agno.svg",
    iconAlt: "Agno",
    title: "Agno",
    techStack: "Python, FastAPI, Agno, AgentUI",
    mainUseCase: "For building AI agents",
    tools: [
      { icon: "/logos/claude.svg", name: "Claude Code", alt: "Claude" },
      { icon: "/logos/vibe-kanban.svg", name: "Vibe Kanban", alt: "Vibe" },
      { icon: "/logos/vscode.svg", name: "VS Code", alt: "VS Code" },
    ],
    price: 6,
  },
  {
    id: "mastra",
    icon: "/logos/mastra.svg",
    iconAlt: "Mastra",
    title: "Mastra",
    techStack: "TypeScript, Mastra, Mastra Playground",
    mainUseCase: "For building AI agents",
    tools: [
      { icon: "/logos/claude.svg", name: "Claude Code", alt: "Claude" },
      { icon: "/logos/vibe-kanban.svg", name: "Vibe Kanban", alt: "Vibe" },
      { icon: "/logos/vscode.svg", name: "VS Code", alt: "VS Code" },
    ],
    price: 6,
  },
  {
    id: "nextjs-chatbot",
    icon: "/logos/nextjs.svg",
    iconAlt: "Next.js",
    title: "Next.js AI Chatbot",
    techStack: "AI SDK, Next.js, TypeScript, Tailwind CSS",
    mainUseCase: "For building AI agents",
    tools: [
      { icon: "/logos/claude.svg", name: "Claude Code", alt: "Claude" },
      { icon: "/logos/vibe-kanban.svg", name: "Vibe Kanban", alt: "Vibe" },
      { icon: "/logos/vscode.svg", name: "VS Code", alt: "VS Code" },
    ],
    price: 6,
  },
  {
    id: "langflow",
    icon: "/logos/langflow.svg",
    iconAlt: "Langflow",
    title: "Langflow",
    techStack: "Python, Langflow",
    mainUseCase: "For building AI automations",
    tools: [
      { icon: "/logos/langflow.svg", name: "Langflow UI", alt: "Langflow" },
      { icon: "/logos/vscode.svg", name: "VS Code", alt: "VS Code" },
    ],
    price: 6,
  },
];

type TemplateCardProps = {
  template: Template;
};

const TemplateCard = ({ template }: TemplateCardProps) => {
  const [selectedAgent, setSelectedAgent] = useState<string>("claude");
  const [selectedTier, setSelectedTier] = useState<string>("dev.small");

  const selectedCodingAgent =
    CODING_AGENTS.find((agent) => agent.id === selectedAgent) ||
    CODING_AGENTS[0];

  const selectedResourceTier =
    RESOURCE_TIERS[selectedTier] || RESOURCE_TIERS["dev.small"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono font-bold flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <Image
              src={template.icon}
              alt={template.iconAlt}
              width={24}
              height={24}
            />
            {template.title}
          </div>

          {template.badge && <Badge>{template.badge}</Badge>}
        </CardTitle>
        <CardDescription>{template.mainUseCase}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <hr className="my-4 border-gray-200" />
        <ul className="space-y-2">
          <li className="flex items-start gap-4">
            <LucideLayers className="w-4 h-4 min-w-4 min-h-4 mt-1" />
            {template.techStack}
          </li>
          {template.tools.map((tool) => {
            // Special case for coding agent selector
            if (tool.name === "Claude Code") {
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
              <li key={tool.name} className="flex items-start gap-4">
                <Image
                  src={tool.icon}
                  alt={tool.alt}
                  width={14}
                  height={14}
                  className="min-w-4 min-h-4 mt-1"
                />
                {tool.name}
              </li>
            );
          })}
        </ul>
      </CardContent>
      <CardFooter className="flex-col w-full">
        <hr className="my-4 border-gray-200" />
        <div className="flex items-start justify-between w-full gap-4">
          <div className="flex flex-col gap-1">
            <Select value={selectedTier} onValueChange={setSelectedTier}>
              <SelectTrigger className="w-fit-content !h-auto text-md p-0 border-none shadow-none bg-transparent gap-1 hover:bg-transparent focus:ring-0 focus:ring-offset-0 [&>svg]:text-lg">
                <span className="mr-2">
                  <span className="text-xl font-bold">
                    ${selectedResourceTier.price}
                  </span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </span>
              </SelectTrigger>
              <SelectContent>
                {Object.values(RESOURCE_TIERS).map((tier) => (
                  <SelectItem key={tier.id} value={tier.id}>
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex gap-1 w-full justify-between">
                        <div className="text-sm font-semibold">
                          ${tier.price}/month
                        </div>
                        <div className="font-mono ">{tier.name}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {tier.cpu} vCPU • {tier.memory} GB RAM • {tier.storage}{" "}
                        GB Disk
                        {tier.cpu > 0.6 && <span>&nbsp;</span>}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              {selectedResourceTier.cpu} vCPU • {selectedResourceTier.memory} GB
              RAM
            </div>
          </div>
          <Button variant="accent">Start Building</Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export const Templates = () => {
  return (
    <section className="bg-slate-100 py-12 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h2 className="text-xl font-bold font-mono tracking-tight text-foreground sm:text-2xl">
            Get started
          </h2>
          <p className="mt-2 text-md leading-8 text-muted-foreground font-mono">
            Cheap machines with the best development tools, to kickoff your
            project right away.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATES.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
        <div className="mt-10 flex justify-end">
          <Button>Build with custom setup →</Button>
        </div>
      </div>
    </section>
  );
};
