"use client";

import {
  ChevronDown,
  Code2,
  Globe,
  Kanban,
  Loader2,
  LogOut,
  type LucideIcon,
  Play,
  Sparkles,
  Square,
  Terminal,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { isGitHubAuthError } from "../../lib/github-error-detection";
import { podRecordToPinacleConfig } from "../../lib/pod-orchestration/pinacle-config";
import { getServiceTemplateUnsafe } from "../../lib/pod-orchestration/service-registry";
import { api } from "../../lib/trpc/client";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { TerminalTabs } from "./terminal-tabs";

type TabConfig = {
  id: string;
  label: string;
  icon: LucideIcon;
  port: number;
  shortcut?: string;
  returnUrl?: string;
  keepRendered?: boolean;
  alwaysReload?: boolean;
};

type WorkbenchProps = {
  pod: {
    id: string;
    name: string;
    slug: string;
    status: string;
    config: string; // JSON string of PinacleConfig
    uiState?: string | null; // JSON string of UI state
    publicUrl?: string | null;
    lastErrorMessage?: string | null;
    alwaysReload?: boolean;
    keepRendered?: boolean;
  };
  onPodSwitch: () => void;
};

/**
 * Map service names to icons
 */
const getServiceIcon = (serviceName: string): LucideIcon => {
  switch (serviceName) {
    case "code-server":
      return Code2;
    case "vibe-kanban":
      return Kanban;
    case "claude-code":
    case "openai-codex":
    case "cursor-cli":
    case "gemini-cli":
      return Sparkles;
    case "web-terminal":
      return Terminal;
    default:
      return Globe;
  }
};

/**
 * Extract port number from URL string
 */
const extractPortFromUrl = (url: string): number => {
  try {
    const urlObj = new URL(url);
    return Number.parseInt(urlObj.port, 10) || 80;
  } catch {
    // If URL parsing fails, try to extract port with regex
    const match = url.match(/:(\d+)/);
    return match ? Number.parseInt(match[1], 10) : 3000;
  }
};

export const Workbench = ({ pod, onPodSwitch }: WorkbenchProps) => {
  // Generate tabs dynamically from pod config
  const tabs = useMemo((): TabConfig[] => {
    try {
      const config = podRecordToPinacleConfig({
        config: pod.config,
        name: pod.name,
      });

      const generatedTabs: TabConfig[] = [];
      let shortcutIndex = 1;

      // Add service tabs (VS Code, Kanban, Claude, Terminal)
      for (const serviceName of config.services) {
        const template = getServiceTemplateUnsafe(serviceName);
        if (template) {
          const isTerminal = serviceName === "web-terminal";
          generatedTabs.push({
            id: serviceName,
            label: template.displayName,
            icon: getServiceIcon(serviceName),
            port: template.defaultPort,
            shortcut: String(shortcutIndex++),
            returnUrl: isTerminal ? "/?arg=0" : undefined,
            keepRendered:
              isTerminal ||
              serviceName.includes("claude") ||
              serviceName.includes("codex") ||
              serviceName.includes("cursor") ||
              serviceName.includes("gemini"),
            alwaysReload: false,
          });
        }
      }

      // Add browser tabs for processes with URLs
      for (const process of config.processes || []) {
        if (process.url) {
          const port = extractPortFromUrl(process.url);
          generatedTabs.push({
            id: `process-${process.name}`,
            label: process.displayName || process.name,
            icon: Globe,
            port: port,
            shortcut: String(shortcutIndex++),
          });
        }
      }

      return generatedTabs;
    } catch (error) {
      console.error("Failed to parse pod config:", error);
      // Fallback to minimal tabs
      return [
        {
          id: "code-server",
          label: "VS Code",
          icon: Code2,
          port: 8726,
          shortcut: "1",
        },
        {
          id: "web-terminal",
          label: "Terminal",
          icon: Terminal,
          port: 7681,
          shortcut: "2",
          returnUrl: "/?arg=0",
          keepRendered: true,
        },
      ];
    }
  }, [pod.config, pod.name]);

  const [activeTab, setActiveTab] = useState<string>(
    tabs[0]?.id || "code-server",
  );
  const { data: session } = useSession();
  const isRunning = pod.status === "running";
  const startPodMutation = api.pods.start.useMutation();
  const utils = api.useUtils();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleSignOut = () => {
    signOut({ callbackUrl: "/" });
  };

  const handleStartPod = async () => {
    try {
      await startPodMutation.mutateAsync({ id: pod.id });
      toast.success(`${pod.name} is starting`, {
        description:
          "The pod is starting up. It may take a few moments to be ready.",
      });
      // Refetch pod data
      utils.pods.getUserPods.invalidate();
    } catch (error) {
      console.error("Failed to start pod:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(`Failed to start ${pod.name}`, {
        description: errorMessage,
      });
    }
  };

  // Poll for status updates when pod is in transitional state
  useEffect(() => {
    const isTransitional =
      pod.status === "starting" ||
      pod.status === "stopping" ||
      pod.status === "creating" ||
      pod.status === "provisioning" ||
      pod.status === "deleting";

    if (isTransitional) {
      // Start polling every 2 seconds
      pollingIntervalRef.current = setInterval(() => {
        utils.pods.getUserPods.invalidate();
      }, 2000);
    } else {
      // Clear polling when not in transitional state
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [pod.status, utils.pods.getUserPods]);

  const getTabUrl = useCallback(
    (tabId: string, terminalSession?: string): string => {
      const tabConfig = tabs.find((t) => t.id === tabId);
      if (!tabConfig) return "";

      // New flow: redirect through authentication endpoint
      // 1. Iframe src points to /api/proxy-auth?pod=slug&port=8726
      // 2. Backend validates session, checks access, generates JWT
      // 3. Redirects to subdomain with token
      // 4. Subdomain validates token, sets scoped cookie
      // 5. Proxies to pod

      // For terminal, use the active session (passed from TerminalTabs component)
      let returnUrl = tabConfig.returnUrl || "";
      if (tabId === "web-terminal" && terminalSession) {
        returnUrl = `/?arg=${terminalSession}`;
      }

      const returnUrlParam = returnUrl
        ? `&return_url=${encodeURIComponent(returnUrl)}`
        : "";

      return `/api/proxy-auth?pod=${encodeURIComponent(pod.slug)}&port=${tabConfig.port}${returnUrlParam}`;
    },
    [pod.slug, tabs],
  );

  const getStatusColor = () => {
    switch (pod.status) {
      case "running":
        return "bg-green-500";
      case "starting":
      case "creating":
        return "bg-yellow-500";
      case "stopping":
      case "deleting":
        return "bg-orange-500";
      case "stopped":
        return "bg-gray-400";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-400";
    }
  };

  return (
    <div className="h-screen flex flex-col bg-neutral-900">
      {/* Top Bar - Minimal */}
      <div className="bg-neutral-900 border-b border-neutral-700 flex items-center px-4 h-12 shrink-0">
        {/* Pod Selector */}
        <button
          type="button"
          onClick={onPodSwitch}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-neutral-800 transition-colors group"
        >
          <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
          <span className="font-mono text-sm text-white font-medium">
            {pod.name}
          </span>
          <ChevronDown className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
        </button>

        {/* Tabs */}
        <div className="flex-1 flex items-center justify-center gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);

                  // Send focus message to the iframe
                  setTimeout(() => {
                    const iframe = document.getElementById(
                      `js-iframe-tab-${tab.id}`,
                    ) as HTMLIFrameElement;

                    console.log("iframe?.contentWindow", iframe?.contentWindow);
                    if (iframe?.contentWindow) {
                      // Send focus message to injected script
                      iframe.contentWindow.postMessage(
                        { type: "pinacle-focus" },
                        "*",
                      );

                      // Also try to focus the iframe element itself
                      iframe.focus();
                    }
                  }, 100);
                }}
                className={`
                  flex items-center gap-2 px-4 py-1.5 rounded-lg font-mono text-sm transition-all cursor-pointer
                  ${
                    isActive
                      ? "bg-neutral-800 text-white shadow-lg ring-1 ring-neutral-700"
                      : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"
                  }
                `}
                title={
                  tab.shortcut ? `${tab.label} (⌘${tab.shortcut})` : tab.label
                }
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.shortcut && (
                  <kbd className="hidden lg:inline text-[10px] bg-neutral-700 px-1.5 py-0.5 rounded text-neutral-300">
                    ⌘{tab.shortcut}
                  </kbd>
                )}
              </button>
            );
          })}
        </div>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-white"
            >
              <div className="w-7 h-7 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                <span className="text-white font-mono text-xs font-bold">
                  {session?.user?.name?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-mono font-bold text-neutral-900">
                {session?.user?.name}
              </p>
              <p className="text-xs text-neutral-600">{session?.user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/team">
                <Users className="mr-2 h-4 w-4" />
                Team
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/account">
                <User className="mr-2 h-4 w-4" />
                Account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative bg-white overflow-hidden">
        {!isRunning ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
            <div className="text-center">
              {pod.status === "starting" ||
              pod.status === "creating" ||
              pod.status === "stopping" ||
              pod.status === "deleting" ? (
                <>
                  <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
                  <p className="text-white font-mono text-lg font-bold mb-2">
                    {pod.status === "stopping"
                      ? "Stopping your pod..."
                      : pod.status === "deleting"
                        ? "Deleting your pod..."
                        : "Starting your pod..."}
                  </p>
                  <p className="text-slate-400 font-mono text-sm">
                    {pod.status === "stopping"
                      ? "Creating snapshot and stopping container..."
                      : pod.status === "deleting"
                        ? "Removing container and cleaning up resources..."
                        : "Checking for snapshots and starting container..."}
                  </p>
                  <p className="text-slate-500 font-mono text-xs mt-2">
                    {pod.status === "stopping"
                      ? "Your pod state is being saved"
                      : pod.status === "deleting"
                        ? ""
                        : "This usually takes 10-30 seconds"}
                  </p>
                </>
              ) : pod.status === "stopped" ? (
                <>
                  <Square className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-white font-mono text-lg font-bold mb-2">
                    Pod is stopped
                  </p>
                  <p className="text-slate-400 font-mono text-sm mb-6">
                    Start your pod to access your development environment
                  </p>
                  <Button
                    size="lg"
                    onClick={handleStartPod}
                    disabled={startPodMutation.isPending}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-mono font-bold disabled:opacity-50"
                  >
                    {startPodMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Start Pod
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Square className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <p className="text-white font-mono text-lg font-bold mb-2">
                    Pod error
                  </p>
                  {isGitHubAuthError(pod.lastErrorMessage) ? (
                    <div className="max-w-lg mx-auto">
                      <p className="text-slate-300 font-mono text-sm mb-4">
                        Your GitHub credentials have expired. Please sign out
                        and sign in again to reconnect your GitHub account.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          window.location.href =
                            "/api/auth/signout?callbackUrl=/auth/signin";
                        }}
                        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-mono text-sm font-semibold rounded transition-colors"
                      >
                        Sign Out & Re-authenticate
                      </button>
                    </div>
                  ) : (
                    <p className="text-slate-400 font-mono text-sm">
                      Something went wrong. Check pod details for more info.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          tabs.map((tab) => {
            const isTerminal = tab.id === "web-terminal";
            const isActive = activeTab === tab.id;

            return (
              <React.Fragment key={tab.id}>
                {/* Terminal with sub-tabs */}
                {isTerminal ? (
                  <div
                    className="absolute inset-0 w-full h-full"
                    style={
                      isActive
                        ? { visibility: "visible", position: "static" }
                        : {
                            visibility: "hidden",
                            position: "absolute",
                            top: 0,
                            zIndex: -1,
                          }
                    }
                  >
                    <TerminalTabs pod={pod} getTabUrl={getTabUrl} />
                  </div>
                ) : (
                  /* Regular iframe for non-terminal tabs */
                  <iframe
                    key={tab.id}
                    id={`js-iframe-tab-${tab.id}`}
                    src={getTabUrl(tab.id)}
                    className="w-full h-full border-0"
                    title={tab.label}
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation-by-user-activation allow-presentation allow-orientation-lock"
                    style={
                      tab.keepRendered
                        ? isActive
                          ? { visibility: "visible", position: "static" }
                          : {
                              visibility: "hidden",
                              position: "absolute",
                              top: 0,
                              zIndex: -1,
                            }
                        : activeTab === tab.id
                          ? { display: "block" }
                          : { display: "none" }
                    }
                  />
                )}
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
};
