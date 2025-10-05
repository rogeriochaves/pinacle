"use client";

import Image from "next/image";
import { Badge } from "../ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";

export type TemplateCardProps = {
  id: string;
  icon?: string;
  iconAlt?: string;
  title: string;
  techStack?: string;
  services?: string[];
  badge?: string;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
};

export const TemplateCard = ({
  icon,
  iconAlt,
  title,
  techStack,
  services = [],
  badge,
  selected = false,
  onClick,
  compact = false,
}: TemplateCardProps) => {
  return (
    <Card
      className={`cursor-pointer transition-all ${
        selected
          ? "border-blue-500 border-2 shadow-md"
          : "border-gray-200 hover:border-gray-300"
      } ${compact ? "" : ""}`}
      onClick={onClick}
    >
      <CardHeader>
        <CardTitle className="font-mono font-bold flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            {icon && (
              <Image src={icon} alt={iconAlt || title} width={24} height={24} />
            )}
            {title}
          </div>
          {badge && <Badge>{badge}</Badge>}
        </CardTitle>
        <CardDescription>{techStack}</CardDescription>
      </CardHeader>
      {!compact && (techStack || services.length > 0) && (
        <CardContent className="flex-1">
          <hr className="my-4 border-gray-200" />
          <ul className="space-y-2">
            {services.map((service) => (
              <li key={service} className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-gray-400" />
                {service}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
};
