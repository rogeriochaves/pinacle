"use client";

import { Check, LucidePlus, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type { CodingAssistantId, ServiceId } from "../../lib/pod-orchestration/service-registry";
import {
  CODING_ASSISTANTS,
  SERVICE_TEMPLATES,
} from "../../lib/pod-orchestration/service-registry";
import { Button } from "../ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../ui/command";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const CODING_ASSISTANT_KEYS = Object.keys(CODING_ASSISTANTS) as CodingAssistantId[];

const AVAILABLE_TOOLS: ServiceId[] = ["vibe-kanban", "code-server"];

type ServiceCustomizerProps = {
  defaultServices: ServiceId[];
  selectedServices: ServiceId[];
  onChange: (services: ServiceId[]) => void;
};

export const ServiceCustomizer = ({
  defaultServices,
  selectedServices,
  onChange,
}: ServiceCustomizerProps) => {
  const [open, setOpen] = useState(false);

  // Find the current coding assistant
  const currentCodingAssistant =
    selectedServices.find((s) => CODING_ASSISTANT_KEYS.includes(s as CodingAssistantId)) ||
    defaultServices.find((s) => CODING_ASSISTANT_KEYS.includes(s as CodingAssistantId)) ||
    "claude-code";

  // Get selected tools (non-coding assistants)
  const selectedTools = selectedServices.filter((s) =>
    AVAILABLE_TOOLS.includes(s),
  );

  const handleCodingAssistantChange = (newAssistant: ServiceId) => {
    // Remove old coding assistant and add new one
    const withoutCodingAssistant = selectedServices.filter(
      (s) => !CODING_ASSISTANT_KEYS.includes(s as CodingAssistantId),
    );
    onChange([...withoutCodingAssistant, newAssistant]);
  };

  const handleToolToggle = (toolName: ServiceId) => {
    if (selectedTools.includes(toolName)) {
      // Remove tool
      onChange(selectedServices.filter((s) => s !== toolName));
    } else {
      // Add tool
      onChange([...selectedServices, toolName]);
    }
  };

  const handleToolRemove = (toolName: ServiceId) => {
    onChange(selectedServices.filter((s) => s !== toolName));
  };

  return (
    <div className="flex gap-4">
      {/* Coding Assistant Column */}
      <div>
        <Label className="text-xs font-mono font-medium text-slate-600 mb-2 block">
          CODING ASSISTANT
        </Label>
        <Select
          value={currentCodingAssistant}
          onValueChange={(value) =>
            handleCodingAssistantChange(value as ServiceId)
          }
        >
          <SelectTrigger className="font-mono bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CODING_ASSISTANT_KEYS.map((serviceName) => {
              const service = SERVICE_TEMPLATES[serviceName];
              return (
                <SelectItem key={serviceName} value={serviceName}>
                  <div className="flex items-center gap-2">
                    {service.icon && (
                      <Image
                        src={service.icon}
                        alt={service.iconAlt || service.displayName}
                        width={16}
                        height={16}
                      />
                    )}
                    <span className="font-mono">{service.displayName}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Tools Column */}
      <div>
        <Label className="text-xs font-mono font-medium text-slate-600 mb-2 block">
          TOOLS
        </Label>
        <div className="flex flex-wrap gap-2 min-h-[40px] items-center">
          {selectedTools.map((toolName) => {
            const tool = SERVICE_TEMPLATES[toolName];
            return (
              <div
                key={toolName}
                className="flex items-center gap-1.5 bg-slate-100 rounded px-2 py-1 text-sm font-mono"
              >
                {tool.icon && (
                  <Image
                    src={tool.icon}
                    alt={tool.iconAlt || tool.displayName}
                    width={14}
                    height={14}
                  />
                )}
                <span>{tool.displayName}</span>
                <button
                  type="button"
                  onClick={() => handleToolRemove(toolName)}
                  className="ml-1 hover:text-orange-500 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {/* Add More Button */}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 border-dashed border font-mono text-xs"
              >
                Add
                <LucidePlus className="w-3 h-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
              <Command>
                <CommandEmpty>No tools found.</CommandEmpty>
                <CommandGroup>
                  {AVAILABLE_TOOLS.map((toolName) => {
                    const tool = SERVICE_TEMPLATES[toolName];
                    const isSelected = selectedTools.includes(toolName);
                    return (
                      <CommandItem
                        key={toolName}
                        onSelect={() => {
                          handleToolToggle(toolName);
                          setOpen(false);
                        }}
                      >
                        <div className="flex items-center gap-2 flex-1">
                          {tool.icon && (
                            <Image
                              src={tool.icon}
                              alt={tool.iconAlt || tool.displayName}
                              width={14}
                              height={14}
                            />
                          )}
                          <span className="font-mono text-sm">
                            {tool.displayName}
                          </span>
                        </div>
                        {isSelected && <Check className="h-4 w-4" />}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
};
