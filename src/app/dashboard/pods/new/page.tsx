"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Code2, Kanban, Terminal, Cpu, HardDrive } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Badge } from "../../../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import { api } from "../../../../lib/trpc/client";

const createPodSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(255),
  description: z.string().optional(),
  templateId: z.string().uuid().optional(),
  teamId: z.string().uuid("Please select a team"),
  cpuCores: z.number().min(1).max(8),
  memoryMb: z.number().min(512).max(16384),
  storageMb: z.number().min(1024).max(100000),
});

type CreatePodForm = z.infer<typeof createPodSchema>;

const getTemplateIcon = (category: string) => {
  switch (category) {
    case "nextjs":
      return Code2;
    case "mastra":
      return Terminal;
    case "custom":
    case "ubuntu":
      return Kanban;
    case "datascience":
      return Terminal;
    case "nodejs":
      return Code2;
    default:
      return Terminal;
  }
};

const resourceConfigs = [
  {
    name: "Starter",
    cpuCores: 1,
    memoryMb: 1024,
    storageMb: 10240,
    price: 8,
    description: "Perfect for personal projects",
  },
  {
    name: "Professional",
    cpuCores: 2,
    memoryMb: 4096,
    storageMb: 51200,
    price: 24,
    description: "For serious development work",
  },
  {
    name: "Enterprise",
    cpuCores: 4,
    memoryMb: 8192,
    storageMb: 204800,
    price: 64,
    description: "For production workloads",
  },
];

export default function NewPodPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedResourceConfig, setSelectedResourceConfig] = useState(0);
  const router = useRouter();

  const { data: teams } = api.teams.getUserTeams.useQuery();
  const { data: templates } = api.pods.getTemplates.useQuery();
  const createPodMutation = api.pods.create.useMutation();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreatePodForm>({
    resolver: zodResolver(createPodSchema),
    defaultValues: {
      cpuCores: resourceConfigs[0].cpuCores,
      memoryMb: resourceConfigs[0].memoryMb,
      storageMb: resourceConfigs[0].storageMb,
    },
  });

  const watchedValues = watch();

  const handleResourceConfigSelect = (index: number) => {
    setSelectedResourceConfig(index);
    const config = resourceConfigs[index];
    setValue("cpuCores", config.cpuCores);
    setValue("memoryMb", config.memoryMb);
    setValue("storageMb", config.storageMb);
  };

  const onSubmit = async (data: CreatePodForm) => {
    try {
      await createPodMutation.mutateAsync({
        ...data,
        templateId: selectedTemplate || undefined,
      });
      router.push(`/dashboard/pods`);
    } catch (error) {
      console.error("Failed to create pod:", error);
    }
  };

  const calculatePrice = () => {
    return Math.ceil((watchedValues.memoryMb / 1024) * 8);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Button variant="ghost" asChild>
          <Link href="/dashboard/pods">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Pods
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Create New Pod
          </h1>
          <p className="mt-2 text-gray-600">
            Set up a new development environment with AI tools
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Template Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Choose a Template</CardTitle>
            <CardDescription>
              Select a pre-configured environment or start with a custom setup
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {templates?.map((template) => {
                const Icon = getTemplateIcon(template.category);
                const isSelected = selectedTemplate === template.id;
                const defaultPorts = template.defaultPorts ? JSON.parse(template.defaultPorts) : [];
                const includes = ["VS Code", "Claude Code", "Vibe Kanban"];

                // Add specific includes based on category
                switch (template.category) {
                  case "nextjs":
                    includes.push("Node.js", "Next.js");
                    break;
                  case "mastra":
                    includes.push("Python", "Mastra");
                    break;
                  case "datascience":
                    includes.push("Python", "Jupyter", "pandas");
                    break;
                  case "nodejs":
                    includes.push("Node.js", "Express");
                    break;
                  default:
                    includes.push("Ubuntu 22.04");
                }

                return (
                  <button
                    key={template.id}
                    type="button"
                    className={`w-full text-left cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                      isSelected
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setSelectedTemplate(template.id)}
                  >
                    <div className="flex items-center space-x-3 mb-3">
                      <Icon className="h-6 w-6 text-blue-600" />
                      <h3 className="font-semibold">{template.name}</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      {template.description}
                    </p>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-700">Includes:</p>
                      <div className="flex flex-wrap gap-1">
                        {includes.map((item) => (
                          <Badge key={item} variant="secondary" className="text-xs">
                            {item}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500">
                        Ports: {defaultPorts.map((port: { external: number }) => port.external).join(", ")}
                      </p>
                    </div>
                  </button>
                );
              }) || (
                <div className="col-span-3 text-center py-8">
                  <p className="text-gray-500">Loading templates...</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Configure your pod's basic settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Pod Name</Label>
                <Input
                  id="name"
                  {...register("name")}
                  placeholder="my-awesome-project"
                />
                {errors.name && (
                  <p className="text-sm text-red-600">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="teamId">Team</Label>
                <Select onValueChange={(value: string) => setValue("teamId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams?.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.teamId && (
                  <p className="text-sm text-red-600">{errors.teamId.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                {...register("description")}
                placeholder="Brief description of your project"
              />
            </div>
          </CardContent>
        </Card>

        {/* Resource Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Resource Configuration</CardTitle>
            <CardDescription>
              Choose your compute resources and estimated pricing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {resourceConfigs.map((config, index) => (
                <button
                  key={config.name}
                  type="button"
                  className={`w-full cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                    selectedResourceConfig === index
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => handleResourceConfigSelect(index)}
                >
                  <div className="text-center">
                    <h3 className="font-semibold text-lg">{config.name}</h3>
                    <p className="text-2xl font-bold text-blue-600 mt-2">
                      ${config.price}/mo
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {config.description}
                    </p>
                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex items-center justify-center space-x-2">
                        <Cpu className="h-4 w-4 text-gray-400" />
                        <span>{config.cpuCores} vCPU</span>
                      </div>
                      <div className="flex items-center justify-center space-x-2">
                        <HardDrive className="h-4 w-4 text-gray-400" />
                        <span>{Math.round(config.memoryMb / 1024)}GB RAM</span>
                      </div>
                      <div className="flex items-center justify-center space-x-2">
                        <HardDrive className="h-4 w-4 text-gray-400" />
                        <span>{Math.round(config.storageMb / 1024)}GB Storage</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom Resource Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="cpuCores">CPU Cores</Label>
                <Input
                  id="cpuCores"
                  type="number"
                  min="1"
                  max="8"
                  {...register("cpuCores", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memoryMb">Memory (MB)</Label>
                <Input
                  id="memoryMb"
                  type="number"
                  min="512"
                  max="16384"
                  step="256"
                  {...register("memoryMb", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="storageMb">Storage (MB)</Label>
                <Input
                  id="storageMb"
                  type="number"
                  min="1024"
                  max="100000"
                  step="1024"
                  {...register("storageMb", { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-medium">Estimated Monthly Cost:</span>
                <span className="text-2xl font-bold text-blue-600">
                  ${calculatePrice()}/month
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Based on {Math.round(watchedValues.memoryMb / 1024)}GB RAM allocation
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center justify-end space-x-4">
          <Button variant="outline" asChild>
            <Link href="/dashboard/pods">Cancel</Link>
          </Button>
          <Button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700"
            disabled={createPodMutation.isPending}
          >
            {createPodMutation.isPending ? "Creating..." : "Create Pod"}
          </Button>
        </div>
      </form>
    </div>
  );
}
