"use client";

import { Book, Check, ChevronDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { cn } from "../../lib/utils";
import type { GitHubOrg, GitHubRepo, SetupFormValues } from "../../types/setup";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type RepositorySelectorProps = {
  form: UseFormReturn<SetupFormValues>;
  repositories: GitHubRepo[];
  isLoadingRepositories: boolean;
  organizations: GitHubOrg[];
  installationUrl: string | null;
};

export const RepositorySelector = ({
  form,
  repositories,
  isLoadingRepositories,
  organizations,
  installationUrl,
}: RepositorySelectorProps) => {
  const t = useTranslations("setup");
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const setupType = form.watch("setupType");
  const selectedRepo = form.watch("selectedRepo");
  const selectedOrg = form.watch("selectedOrg");
  const newRepoName = form.watch("newRepoName");

  const selectedRepoData = repositories.find(
    (repo) => repo.full_name === selectedRepo,
  );

  const errors = form.formState.errors;

  // Scroll to top when search value changes
  useEffect(() => {
    if (listRef.current && searchValue) {
      listRef.current.scrollTop = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  return (
    <>
      <Label className="text-xs font-mono font-medium text-slate-600 mb-4 block">
        {t("projectRepository")}
      </Label>

      <RadioGroup
        value={setupType}
        onValueChange={(value) =>
          form.setValue("setupType", value as "repository" | "new")
        }
        className="space-y-2"
      >
        {/* New Repository Option */}
        <div className="flex items-start space-x-3">
          <RadioGroupItem value="new" id="new" className="bg-white" />
          <div className="flex-1 space-y-3">
            <div>
              <Label
                htmlFor="new"
                className="flex flex-col items-start gap-1 cursor-pointer"
              >
                <div className="font-mono font-medium text-slate-900">
                  {t("newRepository")}
                </div>
              </Label>
            </div>

            {setupType === "new" && (
              <div className="space-y-4 pl-1 pt-2">
                {/* Organization Selector */}
                <div>
                  <Label className="text-xs font-mono font-medium text-slate-600 mb-2 block">
                    {t("organization")}
                  </Label>
                  <Select
                    value={selectedOrg || ""}
                    onValueChange={(value: string) => {
                      if (value === "__connect__") {
                        if (installationUrl) {
                          window.location.href = installationUrl;
                        }
                      } else {
                        form.setValue("selectedOrg", value);
                        form.clearErrors("selectedOrg");
                      }
                    }}
                  >
                    <SelectTrigger className="font-mono bg-background">
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.login}>
                          <div className="flex items-center space-x-2">
                            {/** biome-ignore lint/performance/noImgElement: nah */}
                            <img
                              src={org.avatar_url}
                              alt={org.login}
                              className="w-5 h-5 rounded-full"
                            />
                            <span className="font-mono">{org.login}</span>
                          </div>
                        </SelectItem>
                      ))}
                      <SelectItem value="__connect__">
                        + Connect another organization
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.selectedOrg?.message && (
                    <p className="text-red-500 text-xs mt-1 font-mono">
                      {errors.selectedOrg.message}
                    </p>
                  )}
                </div>

                {/* Repository Name Input */}
                <div>
                  <Label className="text-xs font-mono font-medium text-slate-600 mb-2 block">
                    {t("repositoryName")}
                  </Label>
                  <Input
                    placeholder="my-awesome-project"
                    {...form.register("newRepoName")}
                    className="font-mono"
                  />
                  {errors.newRepoName?.message && (
                    <p className="text-red-500 text-xs mt-1 font-mono">
                      {errors.newRepoName.message}
                    </p>
                  )}
                  {selectedOrg && newRepoName && !errors.newRepoName && (
                    <p className="text-sm text-slate-500 mt-2 font-mono">
                      {selectedOrg}/{newRepoName}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Existing Repository Option */}
        <div className="flex items-start space-x-3">
          <RadioGroupItem
            value="repository"
            id="repository"
            className="bg-white"
          />
          <div className="flex-1 space-y-3">
            <div>
              <Label
                htmlFor="repository"
                className="flex flex-col items-start gap-1 cursor-pointer"
              >
                <div className="font-mono font-medium text-slate-900">
                  {t("existingRepository")}
                </div>
              </Label>
            </div>

            {setupType === "repository" && (
              <div className="pl-1 pt-2">
                <Label className="text-xs font-mono font-medium text-slate-600 mb-2 block">
                  {t("selectRepository")}
                </Label>
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      role="combobox"
                      aria-expanded={open}
                      className="justify-between font-mono border-input bg-white hover:bg-white active:bg-white cursor-default"
                      disabled={isLoadingRepositories}
                    >
                      {selectedRepoData ? (
                        <div className="flex items-center gap-2 min-w-0">
                          {/** biome-ignore lint/performance/noImgElement: nah */}
                          <img
                            src={selectedRepoData.owner.avatar_url}
                            alt={selectedRepoData.owner.login}
                            className="w-5 h-5 rounded-full shrink-0"
                          />
                          <span className="truncate">
                            {selectedRepoData.full_name}
                          </span>
                        </div>
                      ) : isLoadingRepositories ? (
                        <div className="flex items-center gap-2 text-slate-700">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading repositories...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-700">
                          <Book className="h-4 w-4" />
                          {t("selectRepositoryPlaceholder")}
                        </div>
                      )}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[600px] p-0" align="start">
                    <Command shouldFilter={true}>
                      <CommandInput
                        placeholder="Search repositories..."
                        className="h-9 font-mono"
                        value={searchValue}
                        onValueChange={setSearchValue}
                      />
                      <CommandList ref={listRef}>
                        <CommandEmpty>No repository found.</CommandEmpty>
                        <CommandGroup>
                          {repositories.map((repo) => (
                            <CommandItem
                              key={repo.id}
                              value={repo.full_name}
                              keywords={[repo.full_name]}
                              onSelect={() => {
                                form.setValue("selectedRepo", repo.full_name);
                                form.clearErrors("selectedRepo");
                                setOpen(false);
                              }}
                            >
                              <div className="flex items-center gap-3 w-full">
                                {/** biome-ignore lint/performance/noImgElement: nah */}
                                <img
                                  src={repo.owner.avatar_url}
                                  alt={repo.owner.login}
                                  className="w-6 h-6 rounded-full shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-medium text-sm">
                                      {repo.full_name}
                                    </span>
                                    {repo.private && (
                                      <Badge
                                        variant="secondary"
                                        className="text-[10px] px-1.5 py-0"
                                      >
                                        Private
                                      </Badge>
                                    )}
                                  </div>
                                  {repo.description && (
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                                      {repo.description}
                                    </p>
                                  )}
                                </div>
                                <Check
                                  className={cn(
                                    "ml-auto h-4 w-4 shrink-0",
                                    selectedRepo === repo.full_name
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                              </div>
                            </CommandItem>
                          ))}
                          <CommandItem
                            value="__connect__"
                            onSelect={() => {
                              if (installationUrl) {
                                window.location.href = installationUrl;
                              }
                            }}
                            className="border-t mt-1 pt-2"
                          >
                            + Connect another organization
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {errors.selectedRepo?.message && (
                  <p className="text-red-500 text-xs mt-2 font-mono">
                    {errors.selectedRepo.message}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </RadioGroup>
    </>
  );
};
