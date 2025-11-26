import { useCallback, useEffect, useRef } from "react";

type ScreenshotOptions = {
  podId: string;
  port: number;
  path: string;
  onScreenshotSaved?: () => void;
};

export const useScreenshot = () => {
  // Track last screenshot time per iframe
  const lastScreenshotTimeRef = useRef<Record<string, number>>({});
  // Track if we've taken initial screenshot for each iframe
  const hasInitialScreenshotRef = useRef<Record<string, boolean>>({});

  /**
   * Capture screenshot from iframe and save it
   */
  const captureScreenshot = useCallback(
    async (iframeId: string, options: ScreenshotOptions) => {
      try {
        const iframe = document.getElementById(iframeId) as HTMLIFrameElement;
        if (!iframe || !iframe.contentWindow) {
          console.warn(
            `[Screenshot] Iframe ${iframeId} not found or not accessible`,
          );
          return;
        }

        // Generate a unique request ID
        const requestId = `screenshot-${Date.now()}-${Math.random()}`;

        // Set up a promise to wait for the response
        const screenshotPromise = new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            window.removeEventListener("message", handler);
            reject(new Error("Screenshot capture timeout"));
          }, 10000); // 10 second timeout

          const handler = (event: MessageEvent) => {
            if (
              event.data &&
              event.data.requestId === requestId &&
              (event.data.type === "pinacle-screenshot-captured" ||
                event.data.type === "pinacle-screenshot-error")
            ) {
              clearTimeout(timeout);
              window.removeEventListener("message", handler);

              if (event.data.type === "pinacle-screenshot-captured") {
                resolve(event.data.dataUrl);
              } else {
                reject(
                  new Error(event.data.error || "Screenshot capture failed"),
                );
              }
            }
          };

          window.addEventListener("message", handler);
        });

        // Send message to iframe to capture screenshot
        iframe.contentWindow.postMessage(
          {
            type: "pinacle-capture-screenshot",
            requestId,
          },
          "*",
        );

        // Wait for the screenshot
        const imageDataUrl = await screenshotPromise;

        // Send to API
        const response = await fetch("/api/screenshots", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            podId: options.podId,
            port: options.port,
            path: options.path,
            imageDataUrl,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to save screenshot");
        }

        // Update last screenshot time
        lastScreenshotTimeRef.current[iframeId] = Date.now();
        console.log(`[Screenshot] Saved screenshot for ${iframeId}`);

        options.onScreenshotSaved?.();
      } catch (error) {
        console.error("[Screenshot] Error capturing screenshot:", error);
      }
    },
    [],
  );

  /**
   * Check if enough time has passed since last screenshot (5 minutes)
   */
  const shouldTakeScreenshot = useCallback((iframeId: string): boolean => {
    const lastTime = lastScreenshotTimeRef.current[iframeId] || 0;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    return now - lastTime >= fiveMinutes;
  }, []);

  /**
   * Handle tab visibility change (tab switch or window focus)
   */
  const handleTabActivate = useCallback(
    (iframeId: string, options: ScreenshotOptions) => {
      // Take initial screenshot if this is the first time
      if (!hasInitialScreenshotRef.current[iframeId]) {
        hasInitialScreenshotRef.current[iframeId] = true;
        // Delay to let iframe load
        setTimeout(() => {
          captureScreenshot(iframeId, options);
        }, 2000); // 2 second delay for iframe to load
        return;
      }

      // Otherwise, check if 5 minutes have passed
      if (shouldTakeScreenshot(iframeId)) {
        captureScreenshot(iframeId, options);
      }
    },
    [captureScreenshot, shouldTakeScreenshot],
  );

  /**
   * Reset screenshot tracking for an iframe (when it's removed/recreated)
   */
  const resetTracking = useCallback((iframeId: string) => {
    delete lastScreenshotTimeRef.current[iframeId];
    delete hasInitialScreenshotRef.current[iframeId];
  }, []);

  return {
    handleTabActivate,
    resetTracking,
    captureScreenshot,
  };
};

/**
 * Hook to automatically capture screenshots for a specific iframe
 */
export const useIframeScreenshot = (
  iframeId: string,
  isActive: boolean,
  options: ScreenshotOptions,
) => {
  const { handleTabActivate, resetTracking } = useScreenshot();
  const previousActiveRef = useRef(isActive);

  // Handle tab activation
  useEffect(() => {
    if (isActive && !previousActiveRef.current) {
      // Tab just became active
      handleTabActivate(iframeId, options);
    }
    previousActiveRef.current = isActive;
  }, [isActive, iframeId, options, handleTabActivate]);

  // Handle window focus
  useEffect(() => {
    const handleFocus = () => {
      if (isActive) {
        handleTabActivate(iframeId, options);
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [isActive, iframeId, options, handleTabActivate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetTracking(iframeId);
    };
  }, [iframeId, resetTracking]);
};
