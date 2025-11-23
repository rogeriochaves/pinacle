"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getServiceTemplateUnsafe } from "../../lib/pod-orchestration/service-registry";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "../ui/input-group";
import { Label } from "../ui/label";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type AddTabPopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTab: (name: string, url: string, service?: string) => void;
  availableServices: string[]; // Services in the current pod
  existingServiceTabs: string[]; // Services that already have tabs
  children: React.ReactNode; // The trigger button
};

const addTabSchema = z.object({
  serviceType: z.string().min(1, "Please select a service type"),
  tabName: z.string().optional(),
  customUrl: z.string().optional(),
});

type AddTabFormData = z.infer<typeof addTabSchema>;

export const AddTabPopover = ({
  open,
  onOpenChange,
  onCreateTab,
  availableServices,
  existingServiceTabs,
  children,
}: AddTabPopoverProps) => {
  const t = useTranslations("common");
  // Filter out services that already have tabs
  const availableServicesForNewTab = availableServices.filter(
    (service) => !existingServiceTabs.includes(service),
  );
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors },
  } = useForm<AddTabFormData>({
    resolver: zodResolver(addTabSchema),
    defaultValues: {
      serviceType: "custom",
    },
  });

  const serviceType = watch("serviceType");
  const isCustomUrl = serviceType === "custom";

  // Reset form when popover closes
  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const onSubmit = (data: AddTabFormData) => {
    // Manual validation for custom URL
    if (data.serviceType === "custom") {
      let hasError = false;

      if (!data.tabName?.trim()) {
        setError("tabName", { message: "Tab name is required" });
        hasError = true;
      }

      if (!data.customUrl?.trim()) {
        setError("customUrl", { message: "Port is required" });
        hasError = true;
      }

      if (hasError) return;

      const finalName = data.tabName!;
      const finalUrl = `http://localhost:${data.customUrl}`;
      onCreateTab(finalName, finalUrl);
    } else {
      // Service reference - pass service name, not URL
      const template = getServiceTemplateUnsafe(data.serviceType);
      if (template) {
        const finalName = template.displayName;
        // Pass empty URL and the service name
        onCreateTab(finalName, "", data.serviceType);
      }
    }

    reset();
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-80 p-4 bg-white border-gray-200 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 duration-200"
        align="center"
        sideOffset={12}
      >
        <PopoverArrow />
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="service-select" className="text-gray-700 text-sm">
              {t("serviceType")}
            </Label>
            <Select
              value={serviceType}
              onValueChange={(value) => setValue("serviceType", value)}
            >
              <SelectTrigger
                id="service-select"
                className="bg-white border-gray-300"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200">
                <SelectItem value="custom">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <span>{t("customUrl")}</span>
                  </div>
                </SelectItem>
                {availableServicesForNewTab.map((serviceName) => {
                  const template = getServiceTemplateUnsafe(serviceName);
                  if (!template) return null;
                  return (
                    <SelectItem key={serviceName} value={serviceName}>
                      <div className="flex items-center gap-2">
                        <span>{template.displayName}</span>
                        <span className="text-xs text-gray-500">
                          (:{template.defaultPort})
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {isCustomUrl && (
            <>
              <div className="space-y-2">
                <Label htmlFor="tab-name" className="text-gray-700 text-sm">
                  {t("tabName")}
                </Label>
                <Input
                  id="tab-name"
                  placeholder="My App"
                  className="bg-white border-gray-300"
                  {...register("tabName")}
                />
                {errors.tabName && (
                  <p className="text-xs text-red-500">
                    {errors.tabName.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom-url" className="text-gray-700 text-sm">
                  {t("url")}
                </Label>
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <InputGroupText>http://localhost:</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="custom-url"
                    placeholder="8080"
                    className="!pl-1"
                    {...register("customUrl")}
                  />
                </InputGroup>
                {errors.customUrl && (
                  <p className="text-xs text-red-500">
                    {errors.customUrl.message}
                  </p>
                )}
              </div>
            </>
          )}

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2"
            >
              {t("addTab")}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
};
