"use client";

import { SERVICE_TEMPLATES } from "@/lib/pod-orchestration/service-registry";
import { getPublicTemplates } from "@/lib/pod-orchestration/template-registry";
import { TemplateCard } from "../shared/template-card";

type TemplateSelectorProps = {
  selectedTemplate?: string;
  onTemplateChange: (templateId: string) => void;
};

export const TemplateSelector = ({
  selectedTemplate,
  onTemplateChange,
}: TemplateSelectorProps) => {
  const templates = getPublicTemplates();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          id={template.id}
          icon={template.icon}
          iconAlt={template.iconAlt}
          title={template.name}
          techStack={template.techStack}
          services={template.services.map(
            (s) => SERVICE_TEMPLATES[s]?.displayName || s,
          )}
          badge={template.popular ? "Popular" : undefined}
          selected={selectedTemplate === template.id}
          onClick={() => onTemplateChange(template.id)}
          compact={true}
        />
      ))}
    </div>
  );
};

