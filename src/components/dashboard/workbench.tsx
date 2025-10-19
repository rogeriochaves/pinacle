"use client";

import {
  ChevronDown,
  Code2,
  Globe,
  Kanban,
  Loader2,
  LogOut,
  Play,
  Sparkles,
  Square,
  Terminal,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

type Tab = "vscode" | "kanban" | "terminal" | "browser" | "claude";

type WorkbenchProps = {
  pod: {
    id: string;
    name: string;
    slug: string;
    status: string;
    publicUrl?: string | null;
    alwaysReload?: boolean;
    keepRendered?: boolean;
  };
  onPodSwitch: () => void;
};

const TABS = [
  {
    id: "vscode" as const,
    label: "VS Code",
    icon: Code2,
    port: 8726,
    shortcut: "1",
  },
  {
    id: "kanban" as const,
    label: "Kanban",
    icon: Kanban,
    port: 5262,
    shortcut: "2",
  },
  {
    id: "claude" as const,
    label: "Claude",
    icon: Sparkles,
    port: 2528,
    shortcut: "3",
    alwaysReload: true,
  },
  {
    id: "terminal" as const,
    label: "Terminal",
    icon: Terminal,
    port: 7681,
    shortcut: "4",
    returnUrl: "/?arg=0",
    keepRendered: true,
  },
  {
    id: "browser" as const,
    label: "Browser",
    icon: Globe,
    port: 5173,
    shortcut: "5",
  },
];

export const Workbench = ({ pod, onPodSwitch }: WorkbenchProps) => {
  const [activeTab, setActiveTab] = useState<Tab>("vscode");
  const { data: session } = useSession();

  const isRunning = pod.status === "running";

  const handleSignOut = () => {
    signOut({ callbackUrl: "/" });
  };

  const getTabUrl = (tab: Tab): string => {
    const tabConfig = TABS.find((t) => t.id === tab);
    if (!tabConfig) return "";

    // New flow: redirect through authentication endpoint
    // 1. Iframe src points to /api/proxy-auth?pod=slug&port=8726
    // 2. Backend validates session, checks access, generates JWT
    // 3. Redirects to subdomain with token
    // 4. Subdomain validates token, sets scoped cookie
    // 5. Proxies to pod

    const returnUrl = tabConfig.returnUrl
      ? `&return_url=${encodeURIComponent(tabConfig.returnUrl)}`
      : "";

    return `/api/proxy-auth?pod=${encodeURIComponent(pod.slug)}&port=${tabConfig.port}${returnUrl}`;
  };

  const getStatusColor = () => {
    switch (pod.status) {
      case "running":
        return "bg-green-500";
      case "starting":
      case "creating":
        return "bg-yellow-500";
      case "stopped":
        return "bg-gray-400";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-400";
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* Top Bar - Minimal */}
      <div className="bg-slate-900 border-b border-slate-800 flex items-center px-4 h-12 shrink-0">
        {/* Pod Selector */}
        <button
          type="button"
          onClick={onPodSwitch}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors group"
        >
          <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
          <span className="font-mono text-sm text-white font-medium">
            {pod.name}
          </span>
          <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
        </button>

        {/* Tabs */}
        <div className="flex-1 flex items-center justify-center gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  const iframe = document.getElementById(
                    `js-iframe-tab-${tab.id}`,
                  );
                  console.log("iframe", iframe);
                  if (iframe) {
                    setTimeout(() => {
                      console.log("focusing");
                      // (iframe as HTMLIFrameElement).focus();
                      (iframe as HTMLIFrameElement).contentWindow?.focus();
                      // (
                      //   iframe as HTMLIFrameElement
                      // ).contentDocument?.body.focus();
                    }, 1000);
                  }
                }}
                className={`
                  flex items-center gap-2 px-4 py-1.5 rounded-lg font-mono text-sm transition-all cursor-pointer
                  ${
                    isActive
                      ? "bg-slate-800 text-white shadow-lg ring-1 ring-slate-700"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  }
                `}
                title={`${tab.label} (⌘${tab.shortcut})`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <kbd className="hidden lg:inline text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">
                  ⌘{tab.shortcut}
                </kbd>
              </button>
            );
          })}
        </div>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
            >
              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                <span className="text-white font-mono text-xs font-bold">
                  {session?.user?.name?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-mono font-bold text-slate-900">
                {session?.user?.name}
              </p>
              <p className="text-xs text-slate-600">{session?.user?.email}</p>
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
              {pod.status === "starting" || pod.status === "creating" ? (
                <>
                  <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
                  <p className="text-white font-mono text-lg font-bold mb-2">
                    Starting your workspace...
                  </p>
                  <p className="text-slate-400 font-mono text-sm">
                    This usually takes 10-30 seconds
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
                    className="bg-orange-500 hover:bg-orange-600 text-white font-mono font-bold"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Pod
                  </Button>
                </>
              ) : (
                <>
                  <Square className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <p className="text-white font-mono text-lg font-bold mb-2">
                    Pod error
                  </p>
                  <p className="text-slate-400 font-mono text-sm">
                    Something went wrong. Check pod details for more info.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          TABS.filter((tab) => !tab.alwaysReload || activeTab === tab.id).map(
            (tab) => (
              <iframe
                key={tab.id}
                id={`js-iframe-tab-${tab.id}`}
                src={getTabUrl(tab.id)}
                className="w-full h-full border-0"
                title={tab.label}
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation-by-user-activation allow-presentation allow-orientation-lock"
                style={
                  tab.keepRendered
                    ? activeTab === tab.id
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
            ),
          )
        )}
      </div>
    </div>
  );
};
