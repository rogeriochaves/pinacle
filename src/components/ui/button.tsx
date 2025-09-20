import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex gap-2 cursor-pointer relative items-center justify-center border rounded-sm whitespace-nowrap text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 transition-all",
  {
    variants: {
      variant: {
        default:
          "bg-slate-200 text-slate-900 border-slate-950 shadow-btn hover:shadow-btn-hover hover:bg-slate-400 active:bg-slate-400 active:shadow-btn-active",
        destructive:
          "bg-red-300 text-red-950 border-red-950 shadow-btn hover:shadow-btn-hover hover:bg-red-400 active:bg-red-400 active:shadow-btn-active",
        outline:
          "bg-white text-slate-900 border-slate-950 shadow-btn hover:shadow-btn-hover hover:bg-slate-100 active:bg-slate-100 active:shadow-btn-active",
        secondary:
          "bg-slate-200 text-slate-900 border-slate-950 shadow-btn hover:shadow-btn-hover hover:bg-slate-300 active:bg-slate-300 active:shadow-btn-active",
        accent:
          "bg-orange-300 text-orange-950 border-orange-950 shadow-btn hover:shadow-btn-hover hover:bg-orange-400 active:bg-orange-400 active:shadow-btn-active",
        ghost:
          "border-transparent hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
        link: "text-slate-900 underline-offset-4 hover:underline border-transparent",
      },
      size: {
        default: "px-3 py-1.5 h-10",
        sm: "px-2.5 py-1 h-8 text-xs",
        lg: "px-4 py-2 h-12 text-base",
        icon: "w-10 h-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
