import * as React from "react";

import { cn } from "@/lib/utils";

export type BadgeVariant = "default" | "secondary" | "outline" | "success" | "danger";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border border-border text-foreground",
  success: "bg-emerald-500 text-white",
  danger: "bg-destructive text-destructive-foreground",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

export const Badge = ({
  className,
  variant = "default",
  ...props
}: BadgeProps) => {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
};
