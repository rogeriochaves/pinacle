"use client";

import { Check, ChevronDown, History, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "../../lib/trpc/client";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

type DotenvSelectorProps = {
  githubRepo?: string;
  template?: string;
  envVarCount?: number;
  onSelect: (content: string, name: string) => void;
  onOpenManager: () => void;
};

export const DotenvSelector = ({
  githubRepo,
  template,
  envVarCount = 0,
  onSelect,
  onOpenManager,
}: DotenvSelectorProps) => {
  const t = useTranslations("setup");
  const [hasAutoApplied, setHasAutoApplied] = useState(false);
  const [autoAppliedName, setAutoAppliedName] = useState<string | null>(null);

  // Find matching dotenv based on repo or template
  const { data: matchingDotenv, isLoading: isLoadingMatch } =
    api.envSets.findMatching.useQuery(
      { githubRepo, template },
      { enabled: !!(githubRepo || template) },
    );

  // Get all user's dotenvs for the dropdown
  const { data: allDotenvs, isLoading: isLoadingAll } =
    api.envSets.listWithUsage.useQuery();

  // Auto-apply matching dotenv once when found
  useEffect(() => {
    if (matchingDotenv && !hasAutoApplied && matchingDotenv.dotenvContent) {
      onSelect(matchingDotenv.dotenvContent, matchingDotenv.dotenvName || "");
      setHasAutoApplied(true);
      setAutoAppliedName(matchingDotenv.dotenvName || null);
    }
  }, [matchingDotenv, hasAutoApplied, onSelect]);

  // Reset auto-apply when repo/template changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally depends on repo/template props
  useEffect(() => {
    setHasAutoApplied(false);
    setAutoAppliedName(null);
  }, [githubRepo, template]);

  const isLoading = isLoadingMatch || isLoadingAll;

  // Don't show if no dotenvs available
  if (!isLoading && (!allDotenvs || allDotenvs.length === 0)) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {/* Env var count */}
      {envVarCount > 0 && (
        <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
          ({envVarCount} {envVarCount === 1 ? t("variable") : t("variables")})
        </span>
      )}

      {/* Auto-matched indicator */}
      {autoAppliedName && (
        <div className="flex items-center gap-1 text-xs text-green-600 font-mono">
          <Check className="h-3 w-3" />
          <span>
            {t("loadedEnvFrom")} "{autoAppliedName}"
          </span>
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="text-xs font-mono gap-1"
            disabled={isLoading}
          >
            {isLoading ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <History className="h-3 w-3" />
            )}
            {t("reuseEnvVars")}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-80 max-h-80 overflow-y-auto"
        >
          {matchingDotenv && (
            <>
              <div className="px-2 py-1.5 text-xs font-mono text-slate-500">
                {matchingDotenv.matchType === "repo"
                  ? t("matchedByRepo")
                  : t("matchedByTemplate")}
              </div>
              <DropdownMenuItem
                onClick={() =>
                  onSelect(
                    matchingDotenv.dotenvContent || "",
                    matchingDotenv.dotenvName || "",
                  )
                }
                className="font-mono text-sm cursor-pointer"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {matchingDotenv.dotenvName}
                  </span>
                  <span className="text-xs text-slate-500">
                    {t("fromPod")} {matchingDotenv.matchedPodName}
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          <div className="px-2 py-1.5 text-xs font-mono text-slate-500">
            {t("allSavedEnvVars")}
          </div>

          {allDotenvs?.map((dotenv) => (
            <DropdownMenuItem
              key={dotenv.id}
              onClick={() => onSelect(dotenv.content, dotenv.name)}
              className="font-mono text-sm cursor-pointer"
            >
              <div className="flex flex-col gap-0.5 w-full">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{dotenv.name}</span>
                  <span className="text-xs text-slate-400">
                    {dotenv.pods.length}{" "}
                    {dotenv.pods.length === 1 ? "pod" : "pods"}
                  </span>
                </div>
                {dotenv.pods.length > 0 && (
                  <span className="text-xs text-slate-500 truncate">
                    {dotenv.pods
                      .slice(0, 2)
                      .map((p) => p.name)
                      .join(", ")}
                    {dotenv.pods.length > 2 && ` +${dotenv.pods.length - 2}`}
                  </span>
                )}
              </div>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onOpenManager}
            className="font-mono text-sm cursor-pointer text-orange-600"
          >
            {t("manageEnvVars")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
