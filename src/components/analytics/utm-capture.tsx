"use client";

import { useEffect } from "react";
import { captureAndSaveUTM } from "../../lib/analytics/utm";

/**
 * Component that captures UTM parameters from the URL on page load
 * and stores them in session storage
 */
export const UTMCapture = () => {
  useEffect(() => {
    const utm = captureAndSaveUTM();
    if (utm) {
      console.log("[UTM] Captured parameters:", utm);
    }
  }, []); // Only run once on mount

  return null; // This component doesn't render anything
};

