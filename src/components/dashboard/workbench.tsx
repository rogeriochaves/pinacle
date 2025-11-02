"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  Code2,
  GitBranch,
  Globe,
  Kanban,
  Loader2,
  LogOut,
  type LucideIcon,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Terminal,
  User,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isGitHubAuthError } from "../../lib/github-error-detection";
import { podRecordToPinacleConfig } from "../../lib/pod-orchestration/pinacle-config";
import { getServiceTemplateUnsafe } from "../../lib/pod-orchestration/service-registry";
import { api } from "../../lib/trpc/client";
import { GitHubReauthButton } from "../shared/github-reauth-button";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { AddTabPopover } from "./add-tab-popover";
import { AddressBar } from "./address-bar";
import { ScreenshotIframe } from "./screenshot-iframe";
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
  customUrl?: string; // Full URL for custom tabs
  serviceRef?: string; // Service reference for tabs that use a service
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
    githubRepo?: string | null; // For git status checking
  };
  onPodSwitch: () => void;
};

/**
 * Generate a stable hash-based ID for a tab
 * Includes name, service, and url to ensure uniqueness
 */
const generateTabId = (
  name: string,
  service?: string,
  url?: string,
): string => {
  const key = `${name}:${service || ""}:${url || ""}`;
  // Simple hash function - convert to base36 for shorter IDs
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `tab_${Math.abs(hash).toString(36)}`;
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

// Sortable tab component for drag and drop
interface SortableTabProps {
  tab: TabConfig;
  isActive: boolean;
  onTabClick: () => void;
  onDelete: (tabId: string) => void;
}

function SortableTab({
  tab,
  isActive,
  onTabClick,
  onDelete,
}: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const [isHovered, setIsHovered] = React.useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = tab.icon;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Hover tracking for child interactive elements
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        onClick={onTabClick}
        className={`
          flex items-center gap-2 px-4 pr-2 py-1.5 rounded-lg font-mono text-sm transition-all cursor-pointer
          ${
            isActive
              ? "bg-neutral-800 text-white shadow-lg ring-1 ring-neutral-700"
              : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"
          }
        `}
        title={tab.shortcut ? `${tab.label} (⌘${tab.shortcut})` : tab.label}
      >
        <Icon className="w-4 h-4" />
        <span className="hidden sm:inline">{tab.label}</span>
        {tab.shortcut && (
          <button
            type="button"
            onClick={(e) => {
              if (isHovered) {
                e.stopPropagation();
                onDelete(tab.id);
              }
            }}
            className={`hidden lg:flex items-center justify-center text-[10px] px-1.5 py-0.5 rounded min-w-[32px] cursor-pointer ${
              isHovered
                ? "text-neutral-400 hover:bg-neutral-700"
                : "bg-neutral-700 text-neutral-300"
            }`}
            title={isHovered ? "Close tab" : undefined}
          >
            {isHovered ? <X className="w-3 h-3" /> : `⌘${tab.shortcut}`}
          </button>
        )}
      </button>
    </div>
  );
}

export const Workbench = ({ pod, onPodSwitch }: WorkbenchProps) => {
  const [tabs, setTabs] = useState<TabConfig[]>([]);
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [existingServiceTabs, setExistingServiceTabs] = useState<string[]>([]);
  const [showCreateTabDialog, setShowCreateTabDialog] = useState(false);
  const [terminalFocusTrigger, setTerminalFocusTrigger] = useState<number>(0);
  // Track current path for each tab (for screenshots)
  const [tabPaths, setTabPaths] = useState<Record<string, string>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Setup drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const updateTabsMutation = api.pods.updateTabs.useMutation();

  // Poll git status to show badge for uncommitted changes
  const { data: gitStatus } = api.pods.getGitStatus.useQuery(
    { podId: pod.id },
    {
      refetchInterval: 10000, // Poll every 10 seconds
      refetchOnWindowFocus: true, // Only poll when tab is focused
      enabled: pod.status === "running" && !!pod.githubRepo, // Only poll if pod is running and has a repo
    },
  );

  // Generate tabs dynamically from pod config
  useEffect(() => {
    try {
      const config = podRecordToPinacleConfig({
        config: pod.config,
        name: pod.name,
      });

      // Store available services for the Add Tab popover
      setAvailableServices(config.services);

      // Track which services already have tabs
      const servicesWithTabs: string[] = [];

      const generatedTabs: TabConfig[] = [];
      let shortcutIndex = 1;

      // Render tabs from config.tabs only - no automatic generation
      for (const tab of config.tabs || []) {
        // Track service tabs
        if (tab.service) {
          servicesWithTabs.push(tab.service);
        }
        // If tab references a service, use service's icon and defaults
        if (tab.service) {
          const template = getServiceTemplateUnsafe(tab.service);
          if (template) {
            const isTerminal = tab.service === "web-terminal";
            const customUrl = tab.url || "";
            const returnUrl = isTerminal && customUrl ? customUrl : undefined;

            generatedTabs.push({
              id: generateTabId(tab.name, tab.service, undefined),
              label: tab.name,
              icon: getServiceIcon(tab.service),
              port: template.defaultPort,
              shortcut: String(shortcutIndex++),
              returnUrl: isTerminal ? "/?arg=0" : returnUrl,
              keepRendered:
                isTerminal ||
                tab.service.includes("claude") ||
                tab.service.includes("codex") ||
                tab.service.includes("cursor") ||
                tab.service.includes("gemini"),
              customUrl: customUrl || undefined,
              serviceRef: tab.service,
            });
            continue;
          }
        }

        // Pure custom URL tab (no service reference)
        const port = extractPortFromUrl(tab.url || "");
        generatedTabs.push({
          id: generateTabId(tab.name, undefined, tab.url),
          label: tab.name,
          icon: Globe,
          port: port,
          customUrl: tab.url || "",
          shortcut: String(shortcutIndex++),
        });
      }

      setTabs(generatedTabs);
      setExistingServiceTabs(servicesWithTabs);
    } catch (error) {
      console.error("Failed to parse pod config:", error);
      // Fallback to minimal tabs
      setTabs([
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
      ]);
    }
  }, [pod.config, pod.name]);

  const [activeTab, setActiveTab] = useState<string>(
    tabs[0]?.id || "code-server",
  );

  // Ensure activeTab is valid when tabs change
  useEffect(() => {
    if (tabs.length > 0) {
      const isActiveTabValid = tabs.some((tab) => tab.id === activeTab);
      if (!isActiveTabValid) {
        // Active tab doesn't exist anymore, switch to first tab
        setActiveTab(tabs[0].id);
      }
    }
  }, [tabs, activeTab]);

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

  // Save tabs to backend
  const saveTabs = async (updatedTabs: TabConfig[]) => {
    const tabsToSave = updatedTabs.map((tab) => ({
      name: tab.label,
      service: tab.serviceRef || undefined,
      url: tab.customUrl || undefined,
    }));

    try {
      await updateTabsMutation.mutateAsync({
        podId: pod.id,
        tabs: tabsToSave,
      });
      // Refetch pod data to get updated config
      utils.pods.getUserPods.invalidate();
    } catch (error) {
      console.error("Failed to save tabs:", error);
      toast.error("Failed to save tabs", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  };

  // Handle creating a new tab
  const handleCreateTab = (name: string, url: string, service?: string) => {
    // Generate tab ID based on name + service/url
    const tabId = generateTabId(name, service, service ? undefined : url);

    // Check if tab with this ID already exists (duplicate)
    const existingTab = tabs.find((tab) => tab.id === tabId);
    if (existingTab) {
      toast.error("Tab already exists", {
        description: `A tab with this name and URL/service already exists`,
      });
      return;
    }

    let newTab: TabConfig;

    // Calculate next available shortcut number
    const nextShortcut = String(tabs.length + 1);

    if (service) {
      // Service tab - reference the service
      const template = getServiceTemplateUnsafe(service);
      if (!template) return;

      const isTerminal = service === "web-terminal";

      newTab = {
        id: tabId,
        label: name,
        icon: getServiceIcon(service),
        port: template.defaultPort,
        shortcut: nextShortcut,
        serviceRef: service,
        keepRendered:
          isTerminal ||
          service.includes("claude") ||
          service.includes("codex") ||
          service.includes("cursor") ||
          service.includes("gemini"),
      };
    } else {
      // Custom URL tab
      const port = extractPortFromUrl(url);
      newTab = {
        id: tabId,
        label: name,
        icon: Globe,
        port: port,
        shortcut: nextShortcut,
        customUrl: url,
      };
    }

    const updatedTabs = [...tabs, newTab];
    setTabs(updatedTabs);
    setActiveTab(newTab.id);
    saveTabs(updatedTabs);
    toast.success("Tab created", {
      description: `Added ${name} tab`,
    });
  };

  // Handle deleting a tab
  const handleDeleteTab = (tabId: string) => {
    const updatedTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(updatedTabs);
    if (activeTab === tabId) {
      setActiveTab(updatedTabs[0]?.id || "code-server");
    }
    saveTabs(updatedTabs);
    toast.success("Tab deleted");
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tabs.findIndex((tab) => tab.id === active.id);
      const newIndex = tabs.findIndex((tab) => tab.id === over.id);

      const updatedTabs = arrayMove(tabs, oldIndex, newIndex);
      setTabs(updatedTabs);
      saveTabs(updatedTabs);
    }
  };

  // Handle refresh button click
  const handleRefresh = () => {
    const currentTab = tabs.find((tab) => tab.id === activeTab);
    if (!currentTab) return;

    setIsRefreshing(true);

    // Special case for web-terminal: refresh the current active terminal session
    if (currentTab.serviceRef === "web-terminal") {
      // Find the active terminal session iframe
      const terminalIframes = document.querySelectorAll('[id^="terminal-"]');
      let activeTerminalIframe: HTMLIFrameElement | null = null;

      for (const iframe of terminalIframes) {
        const iframeElement = iframe as HTMLIFrameElement;
        if (
          iframeElement.style.visibility === "visible" ||
          window.getComputedStyle(iframeElement).visibility === "visible"
        ) {
          activeTerminalIframe = iframeElement;
          break;
        }
      }

      if (activeTerminalIframe) {
        // Store the current src and reload it
        const currentSrc = activeTerminalIframe.src;
        activeTerminalIframe.src = "";
        setTimeout(() => {
          if (activeTerminalIframe) {
            activeTerminalIframe.src = currentSrc;
          }
        }, 10);

        // Stop spinning after a short delay (iframe onload is tricky with cross-origin)
        setTimeout(() => {
          setIsRefreshing(false);
        }, 1000);
      } else {
        setIsRefreshing(false);
      }
    } else {
      // Regular tab: refresh the iframe
      const iframe = document.getElementById(
        `js-iframe-tab-${currentTab.id}`,
      ) as HTMLIFrameElement;

      if (iframe) {
        // Store the current src and reload it
        const currentSrc = iframe.src;
        iframe.src = "";
        setTimeout(() => {
          iframe.src = currentSrc;
        }, 10);

        // Stop spinning after a short delay
        setTimeout(() => {
          setIsRefreshing(false);
        }, 1000);
      } else {
        setIsRefreshing(false);
      }
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

  // Handle keyboard shortcuts (Cmd+1, Cmd+2, etc.)
  useEffect(() => {
    const handleShortcut = (key: string) => {
      const num = parseInt(key, 10);

      if (num >= 1 && num <= 9) {
        // Find the tab with this shortcut
        const targetTab = tabs.find((tab) => tab.shortcut === String(num));
        if (targetTab) {
          setActiveTab(targetTab.id);

          // Focus the tab
          if (targetTab.serviceRef === "web-terminal") {
            setTerminalFocusTrigger(Date.now());
          } else {
            setTimeout(() => {
              const iframe = document.getElementById(
                `js-iframe-tab-${targetTab.id}`,
              ) as HTMLIFrameElement;

              if (iframe?.contentWindow) {
                iframe.contentWindow.postMessage(
                  { type: "pinacle-focus" },
                  "*",
                );
                iframe.focus();
              }
            }, 100);
          }
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd/Ctrl+number (1-9)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key, 10);

        if (num >= 1 && num <= 9) {
          e.preventDefault(); // Prevent browser default behavior
          handleShortcut(e.key);
        }
      }
    };

    // Listen for keyboard shortcuts forwarded from iframes
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "pinacle-keyboard-shortcut") {
        // Shortcut forwarded from iframe
        handleShortcut(e.data.key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("message", handleMessage);
    };
  }, [tabs]);

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
      if (tabConfig.serviceRef === "web-terminal" && terminalSession) {
        returnUrl = `/?arg=${terminalSession}`;
      }

      const returnUrlParam = returnUrl
        ? `&return_url=${encodeURIComponent(returnUrl)}`
        : "";

      return `/api/proxy-auth?pod=${encodeURIComponent(pod.slug)}&port=${tabConfig.port}${returnUrlParam}`;
    },
    [pod.slug, tabs],
  );

  // Handle navigation from address bar
  const handleAddressBarNavigate = useCallback(
    (tabId: string, proxyUrl: string) => {
      // Extract the path and port from the proxy URL and navigate
      try {
        const url = new URL(proxyUrl);
        const path = url.pathname + url.search + url.hash;

        // Extract port from hostname: localhost-3000.pod-myslug.localhost
        const match = url.hostname.match(/^localhost-(\d+)\./);
        if (!match) {
          console.error("Could not extract port from proxy URL");
          return;
        }

        const port = Number.parseInt(match[1], 10);

        // Build the auth URL with the new port and path
        const returnUrlParam = path ? `&return_url=${encodeURIComponent(path)}` : "";
        const authUrl = `/api/proxy-auth?pod=${encodeURIComponent(pod.slug)}&port=${port}${returnUrlParam}`;

        // Update the iframe src
        const iframe = document.getElementById(
          `js-iframe-tab-${tabId}`,
        ) as HTMLIFrameElement;
        if (iframe) {
          iframe.src = authUrl;
        }
      } catch (error) {
        console.error("Failed to parse proxy URL:", error);
      }
    },
    [pod.slug],
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
    <TooltipProvider delayDuration={0}>
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="flex-1 flex items-center justify-center gap-1">
              <SortableContext
                items={tabs.map((tab) => tab.id)}
                strategy={horizontalListSortingStrategy}
              >
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <SortableTab
                      key={tab.id}
                      tab={tab}
                      isActive={isActive}
                      onTabClick={() => {
                        setActiveTab(tab.id);

                        // Check if this is a terminal tab
                        if (tab.serviceRef === "web-terminal") {
                          // Trigger focus in TerminalTabs component
                          setTerminalFocusTrigger(Date.now());
                        } else {
                          // Send focus message to regular iframe
                          setTimeout(() => {
                            const iframe = document.getElementById(
                              `js-iframe-tab-${tab.id}`,
                            ) as HTMLIFrameElement;

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
                        }
                      }}
                      onDelete={handleDeleteTab}
                    />
                  );
                })}
              </SortableContext>

              {/* Add Tab Button */}
              <Tooltip>
                <AddTabPopover
                  open={showCreateTabDialog}
                  onOpenChange={setShowCreateTabDialog}
                  onCreateTab={handleCreateTab}
                  availableServices={availableServices}
                  existingServiceTabs={existingServiceTabs}
                >
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg font-mono text-sm transition-all text-neutral-400 hover:text-white hover:bg-neutral-800/50 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                </AddTabPopover>
                <TooltipContent>
                  <p>Add new tab</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </DndContext>

          {/* Refresh Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={!isRunning || isRefreshing}
                className="flex items-center justify-center mr-1 w-8 h-8 rounded-lg hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Refresh current tab</p>
            </TooltipContent>
          </Tooltip>

          {/* Source Control Icon (only if VSCode tab exists) */}
          {tabs.some((tab) => tab.serviceRef === "code-server") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    // Find the VSCode tab
                    const vscodeTab = tabs.find(
                      (tab) => tab.serviceRef === "code-server",
                    );
                    if (!vscodeTab) return;

                    // Switch to VSCode tab
                    setActiveTab(vscodeTab.id);

                    // Send postMessage to open source control view
                    setTimeout(() => {
                      const iframe = document.getElementById(
                        `js-iframe-tab-${vscodeTab.id}`,
                      ) as HTMLIFrameElement;

                      if (iframe?.contentWindow) {
                        iframe.contentWindow.postMessage(
                          { type: "pinacle-source-control-view" },
                          "*",
                        );
                      }
                    }, 100);
                  }}
                  className="relative flex items-center justify-center mr-1 w-8 h-8 rounded-lg hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-white cursor-pointer"
                >
                  <GitBranch className="w-4 h-4 mt-0.5 mr-0.5" />
                  {gitStatus?.hasChanges && (
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 bg-orange-500 text-white text-[10px] font-bold rounded-full">
                      {gitStatus.changedFiles}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {gitStatus?.hasChanges
                    ? `${gitStatus.changedFiles} uncommitted change${gitStatus.changedFiles !== 1 ? "s" : ""}`
                    : "Commit changes"}
                </p>
              </TooltipContent>
            </Tooltip>
          )}

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
                <p className="text-xs text-neutral-600">
                  {session?.user?.email}
                </p>
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
                          Your GitHub token has expired. Click below to refresh
                          your authentication and retry the operation.
                        </p>
                        <GitHubReauthButton className="cursor-pointer px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-mono text-sm font-semibold rounded transition-colors" />
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
              const isTerminal = tab.serviceRef === "web-terminal";
              const isActive = activeTab === tab.id;
              // Show address bar for custom URL tabs (process tabs) - not for service tabs
              const isProcessTab = !tab.serviceRef && tab.customUrl;

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
                      <TerminalTabs
                        pod={pod}
                        terminalTabId={tab.id}
                        getTabUrl={getTabUrl}
                        focusTrigger={terminalFocusTrigger}
                      />
                    </div>
                  ) : (
                    /* Regular iframe for non-terminal tabs */
                    <div
                      className="absolute inset-0 w-full h-full flex flex-col"
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
                            ? { display: "flex" }
                            : { display: "none" }
                      }
                    >
                      {/* Address bar for process tabs only */}
                      {isProcessTab && (
                        <AddressBar
                          iframeId={`js-iframe-tab-${tab.id}`}
                          podSlug={pod.slug}
                          initialPort={tab.port}
                          onNavigate={(proxyUrl) =>
                            handleAddressBarNavigate(tab.id, proxyUrl)
                          }
                          onPathChange={(path) => {
                            setTabPaths((prev) => ({
                              ...prev,
                              [tab.id]: path,
                            }));
                          }}
                        />
                      )}
                      {/* Use ScreenshotIframe for process tabs to auto-capture screenshots */}
                      {isProcessTab ? (
                        <ScreenshotIframe
                          iframeId={`js-iframe-tab-${tab.id}`}
                          podId={pod.id}
                          port={tab.port}
                          path={tabPaths[tab.id] || "/"}
                          isActive={isActive}
                          src={getTabUrl(tab.id)}
                          title={tab.label}
                          className="w-full h-full border-0 flex-1"
                        />
                      ) : (
                        <iframe
                          key={tab.id}
                          id={`js-iframe-tab-${tab.id}`}
                          src={getTabUrl(tab.id)}
                          className="w-full h-full border-0 flex-1"
                          title={tab.label}
                          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation-by-user-activation allow-presentation allow-orientation-lock"
                        />
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};
