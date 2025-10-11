"use client";

import Image from "next/image";
import { getPublicTemplates } from "@/lib/pod-orchestration/template-registry";
import { Badge } from "../ui/badge";

type TemplateSelectorProps = {
  selectedTemplate?: string;
  onTemplateChange: (templateId: string) => void;
  compact?: boolean;
  showOnlyBlank?: boolean; // Only show blank templates for existing repositories
};

export const TemplateSelector = ({
  selectedTemplate,
  onTemplateChange,
  compact = false,
  showOnlyBlank = false,
}: TemplateSelectorProps) => {
  const allTemplates = getPublicTemplates();

  // Filter templates based on showOnlyBlank flag
  const templates = showOnlyBlank
    ? allTemplates.filter(
        (template) =>
          template.id === "nodejs-blank" || template.id === "python-blank"
      )
    : allTemplates;

  if (compact) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {templates.map((template) => {
          const isSelected = selectedTemplate === template.id;

          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onTemplateChange(template.id)}
              className={`
                w-full flex items-center gap-3 px-4 py-2 rounded-lg border-2 transition-all
                ${
                  isSelected
                    ? "border-orange-500 bg-orange-50"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }
              `}
            >
              {/* Icon */}
              {template.icon && (
                <div className="shrink-0">
                  <Image
                    src={template.icon}
                    alt={template.iconAlt || template.name}
                    width={24}
                    height={24}
                  />
                </div>
              )}

              {/* Content */}
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono font-bold text-sm text-slate-900">
                    {template.name}
                  </span>
                  {template.popular && (
                    <Badge className="bg-orange-500 text-white text-[10px] px-1.5 py-0">
                      Popular
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-600 truncate">
                  {template.techStack}
                </p>
              </div>

              {/* Radio indicator */}
              <div
                className={`
                w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0
                ${isSelected ? "border-orange-500" : "border-gray-300"}
              `}
              >
                {isSelected && (
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // Non-compact version for landing page
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {templates.map((template) => {
        const isSelected = selectedTemplate === template.id;

        return (
          <button
            key={template.id}
            type="button"
            onClick={() => onTemplateChange(template.id)}
            className={`
              relative bg-white rounded-xl p-6 text-left transition-all duration-200
              hover:shadow-lg hover:-translate-y-1
              ${
                isSelected
                  ? "ring-2 ring-orange-500 shadow-lg scale-[1.02]"
                  : "shadow-sm border border-gray-200"
              }
            `}
          >
            {template.popular && (
              <div className="absolute -top-2 -right-2">
                <Badge className="bg-orange-500 text-white text-xs px-2 py-0.5">
                  Popular
                </Badge>
              </div>
            )}

            <div className="flex items-center gap-3 mb-3">
              {template.icon && (
                <Image
                  src={template.icon}
                  alt={template.iconAlt || template.name}
                  width={32}
                  height={32}
                  className="shrink-0"
                />
              )}
              <h3 className="font-mono font-bold text-lg text-gray-900">
                {template.name}
              </h3>
            </div>

            {template.mainUseCase && (
              <p className="text-sm text-gray-600 mb-4">
                {template.mainUseCase}
              </p>
            )}

            {template.techStack && (
              <div className="text-sm text-gray-700">{template.techStack}</div>
            )}

            {isSelected && (
              <div className="absolute top-4 right-4">
                <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
