"use client";

import { useEffect, useRef } from "react";
import { useIframeScreenshot } from "./use-screenshot";

type ScreenshotIframeProps = {
  iframeId: string;
  podId: string;
  port: number;
  path: string;
  isActive: boolean;
  src: string;
  title: string;
  className?: string;
  onLoad?: () => void;
  onLoadStart?: () => void;
};

export const ScreenshotIframe = ({
  iframeId,
  podId,
  port,
  path,
  isActive,
  src,
  title,
  className,
  onLoad,
  onLoadStart,
}: ScreenshotIframeProps) => {
  const prevSrcRef = useRef(src);

  // Automatically capture screenshots when appropriate
  useIframeScreenshot(iframeId, isActive, {
    podId,
    port,
    path,
  });

  // Trigger onLoadStart when src changes
  useEffect(() => {
    if (src !== prevSrcRef.current) {
      prevSrcRef.current = src;
      onLoadStart?.();
    }
  }, [src, onLoadStart]);

  // Trigger onLoadStart on initial mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: meh
  useEffect(() => {
    onLoadStart?.();
  }, []);

  return (
    <iframe
      id={iframeId}
      src={src}
      className={className}
      title={title}
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation-by-user-activation allow-presentation allow-orientation-lock"
      onLoadStart={onLoadStart}
      onLoad={onLoad}
    />
  );
};
