"use client";

import { ArrowLeft, ArrowRight, RotateCw } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type AddressBarProps = {
  iframeId: string;
  podSlug: string;
  initialPort: number;
  initialPath?: string;
  onNavigate: (url: string) => void;
  onPathChange?: (path: string, port: number) => void;
  onRefresh?: () => void;
};

/**
 * Convert a user-friendly localhost URL to a proxy URL
 * E.g., localhost:3000/path -> http://localhost-3000-pod-myslug.localhost:3000/path
 */
const localhostToProxyUrl = (localhostUrl: string, podSlug: string): string => {
  try {
    // Normalize input: add http:// if not present
    let normalized = localhostUrl.trim();
    if (
      !normalized.startsWith("http://") &&
      !normalized.startsWith("https://")
    ) {
      normalized = `http://${normalized}`;
    }

    const url = new URL(normalized);

    // Only allow localhost URLs
    if (!url.hostname.includes("localhost") && url.hostname !== "127.0.0.1") {
      throw new Error("Only localhost URLs are allowed");
    }

    const port = url.port || "3000";
    // Detect environment from window.location
    const isDevelopment =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");
    const baseDomain = isDevelopment ? "localhost:3000" : "pinacle.dev";

    // Build proxy URL: http://localhost-{PORT}-pod-{SLUG}.{DOMAIN}/path
    return `http://localhost-${port}-pod-${podSlug}.${baseDomain}${url.pathname}${url.search}${url.hash}`;
  } catch (error) {
    throw new Error(
      `Invalid URL format.\n${error instanceof Error ? error.message : ""}`,
    );
  }
};

export const AddressBar = ({
  iframeId,
  podSlug,
  initialPort,
  initialPath = "/",
  onNavigate,
  onPathChange,
  onRefresh,
}: AddressBarProps) => {
  const [displayUrl, setDisplayUrl] = useState(
    `localhost:${initialPort}${initialPath}`,
  );
  const [inputUrl, setInputUrl] = useState(
    `localhost:${initialPort}${initialPath}`,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [currentPort, setCurrentPort] = useState(initialPort);
  const [currentIframeUrl, setCurrentIframeUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Track navigation steps - just counters, iframe is the master of URLs
  const [backSteps, setBackSteps] = useState(-2);
  const [forwardSteps, setForwardSteps] = useState(0);
  const lastActionRef = useRef<"back" | "forward" | "navigate" | null>(null);

  // Get iframe reference and reset state when iframe changes
  useEffect(() => {
    const iframe = document.getElementById(iframeId) as HTMLIFrameElement;
    if (iframe) {
      iframeRef.current = iframe;
    }

    // Reset navigation tracking when switching tabs
    setBackSteps(-2);
    setForwardSteps(0);
  }, [iframeId]);

  // Listen for navigation events from the iframe (source of truth)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only process messages from our iframe
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      if (event.data && event.data.type === "pinacle-navigation") {
        // Extract the path and port from the iframe's actual location
        const iframeUrl = event.data.url;
        const pathname = event.data.pathname || "/";
        const search = event.data.search || "";
        const hash = event.data.hash || "";

        // Store the current iframe URL for refresh
        setCurrentIframeUrl(iframeUrl);

        // Extract port from the URL
        try {
          const url = new URL(iframeUrl);
          const match = url.hostname.match(/^localhost-(\d+)-pod-/);
          if (match) {
            const port = Number.parseInt(match[1], 10);
            setCurrentPort(port);
            const friendlyUrl = `localhost:${port}${pathname}${search}${hash}`;
            const fullPath = `${pathname}${search}${hash}`;
            setDisplayUrl(friendlyUrl);
            if (!isEditing) {
              setInputUrl(friendlyUrl);
            }

            // Notify parent component of path change (for screenshots)
            onPathChange?.(fullPath, port);

            // Update navigation step counters based on the action
            const lastAction = lastActionRef.current;
            lastActionRef.current = null; // Reset

            if (lastAction === "back") {
              // Going back: one less step to go back, one more to go forward
              setBackSteps((prev) => Math.max(0, prev - 1));
              setForwardSteps((prev) => prev + 1);
            } else if (lastAction === "forward") {
              // Going forward: one more step to go back, one less to go forward
              setBackSteps((prev) => prev + 1);
              setForwardSteps((prev) => Math.max(0, prev - 1));
            } else {
              // New navigation: add to back history, clear forward history
              setBackSteps((prev) => prev + 1);
              setForwardSteps(0);
            }
          }
        } catch (error) {
          console.debug("Error parsing iframe navigation URL:", error);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [isEditing, onPathChange]);

  const handleNavigate = (localhostUrl: string) => {
    try {
      // Normalize the URL to ensure it has a proper format
      let normalized = localhostUrl.trim();
      if (
        !normalized.startsWith("http://") &&
        !normalized.startsWith("https://")
      ) {
        normalized = `http://${normalized}`;
      }

      // Parse to get consistent format
      const url = new URL(normalized);
      const enteredPort = url.port || "3000";
      const friendlyUrl = `localhost:${enteredPort}${url.pathname}${url.search}${url.hash}`;

      // Mark this as a new navigation
      lastActionRef.current = "navigate";

      // User manually navigated - reset counters and disable tracking until navigation completes
      setBackSteps((steps) => steps - 1);
      setForwardSteps(0);

      const proxyUrl = localhostToProxyUrl(localhostUrl, podSlug);
      onNavigate(proxyUrl);

      // Update the displayed URL optimistically
      setDisplayUrl(friendlyUrl);
      setInputUrl(friendlyUrl);
      setCurrentPort(Number.parseInt(enteredPort, 10));
      setIsEditing(false);

      // Blur the input to prevent focus issues with iframe
      inputRef.current?.blur();
    } catch (error) {
      toast.error("Invalid URL", {
        description: error instanceof Error ? error.message : "Unknown error",
        duration: 3000,
      });
      // Reset to default URL on error
      const resetUrl = `localhost:${currentPort}/`;
      setDisplayUrl(resetUrl);
      setInputUrl(resetUrl);
      setIsEditing(false);
      inputRef.current?.blur();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleNavigate(inputUrl);
  };

  const handleBack = () => {
    // Mark that we're going back
    lastActionRef.current = "back";

    // Send back command to iframe
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: "pinacle-navigation-back" },
        "*",
      );
    }
  };

  const handleForward = () => {
    // Mark that we're going forward
    lastActionRef.current = "forward";

    // Send forward command to iframe
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: "pinacle-navigation-forward" },
        "*",
      );
    }
  };

  const handleRefresh = () => {
    // Notify parent that we're refreshing (for loading indicator)
    onRefresh?.();

    // Reload the iframe with its current URL (not the original src)
    if (iframeRef.current) {
      // If we have the current iframe URL, use that
      // Otherwise fall back to the iframe's src attribute
      const urlToLoad = currentIframeUrl || iframeRef.current.src;
      iframeRef.current.src = "";
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = urlToLoad;
        }
      }, 10);
    }
  };

  // Calculate if we can go back/forward based on our step counters
  const canGoBack = backSteps > 0;
  const canGoForward = forwardSteps > 0;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800 border-b border-neutral-700">
      {/* Back Button - always clickable, just looks disabled when no history */}
      <button
        type="button"
        onClick={handleBack}
        className={`p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors ${
          !canGoBack ? "opacity-30" : ""
        }`}
        title="Go back"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      {/* Forward Button - always clickable, just looks disabled when no history */}
      <button
        type="button"
        onClick={handleForward}
        className={`p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors ${
          !canGoForward ? "opacity-30" : ""
        }`}
        title="Go forward"
      >
        <ArrowRight className="w-4 h-4" />
      </button>

      {/* Refresh Button */}
      <button
        type="button"
        onClick={handleRefresh}
        className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
        title="Refresh"
      >
        <RotateCw className="w-4 h-4" />
      </button>

      {/* Address Input */}
      <form onSubmit={handleSubmit} className="flex-1">
        <input
          ref={inputRef}
          type="text"
          value={isEditing ? inputUrl : displayUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onFocus={() => {
            setIsEditing(true);
            setInputUrl(displayUrl);
            // Select all text on focus for easy editing
            setTimeout(() => {
              inputRef.current?.select();
            }, 0);
          }}
          onBlur={() => {
            setIsEditing(false);
            setInputUrl(displayUrl);
          }}
          className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-600 rounded text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          placeholder="localhost:3000/path"
          spellCheck={false}
        />
      </form>
    </div>
  );
};
