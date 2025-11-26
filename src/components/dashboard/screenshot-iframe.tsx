"use client";

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
}: ScreenshotIframeProps) => {
  // Automatically capture screenshots when appropriate
  useIframeScreenshot(iframeId, isActive, {
    podId,
    port,
    path,
  });

  return (
    <iframe
      id={iframeId}
      src={src}
      className={className}
      title={title}
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation-by-user-activation allow-presentation allow-orientation-lock"
    />
  );
};
