"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-slate-100 group-[.toaster]:text-slate-900 group-[.toaster]:border-2 group-[.toaster]:border-slate-950 group-[.toaster]:shadow-toast group-[.toaster]:rounded-sm group-[.toaster]:font-mono group-[.toaster]:relative group-[.toaster]:font-medium",
          description:
            "group-[.toast]:text-slate-700 group-[.toast]:font-mono group-[.toast]:text-sm",
          actionButton:
            "toast-action-button group-[.toast]:bg-slate-200 group-[.toast]:text-slate-900 group-[.toast]:border-2 group-[.toast]:border-slate-950 group-[.toast]:shadow-btn group-[.toast]:rounded-sm group-[.toast]:font-mono group-[.toast]:font-medium hover:group-[.toast]:shadow-btn-hover hover:group-[.toast]:bg-slate-300 active:group-[.toast]:shadow-btn-active",
          cancelButton:
            "group-[.toast]:bg-white group-[.toast]:text-slate-900 group-[.toast]:border-2 group-[.toast]:border-slate-950 group-[.toast]:shadow-btn group-[.toast]:rounded-sm group-[.toast]:font-mono group-[.toast]:font-medium hover:group-[.toast]:shadow-btn-hover hover:group-[.toast]:bg-slate-50 active:group-[.toast]:shadow-btn-active",
          closeButton:
            "group-[.toast]:!bg-transparent group-[.toast]:!border-none group-[.toast]:text-slate-900 hover:group-[.toast]:text-slate-700 group-[.toast]:!shadow-none group-[.toast]:absolute group-[.toast]:top-2 group-[.toast]:right-2",
          success:
            "group-[.toaster]:!bg-green-100 group-[.toaster]:!border-green-950 group-[.toaster]:!text-green-950 [&_[data-icon]]:!text-green-700",
          error:
            "group-[.toaster]:!bg-red-200 group-[.toaster]:!border-red-950 group-[.toaster]:!text-red-950 [&_[data-icon]]:!text-red-700",
          warning:
            "group-[.toaster]:!bg-orange-200 group-[.toaster]:!border-orange-950 group-[.toaster]:!text-orange-950 [&_[data-icon]]:!text-orange-700",
          info: "group-[.toaster]:!bg-blue-100 group-[.toaster]:!border-blue-950 group-[.toaster]:!text-blue-950 [&_[data-icon]]:!text-blue-700",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
