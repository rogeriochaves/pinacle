"use client";

import posthog from "posthog-js";
import NextError from "next/error";
import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Capture the error in PostHog
    posthog.captureException(error);
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="font-mono antialiased">
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-gray-800 rounded-lg p-8 text-center">
            <h1 className="text-2xl font-bold text-red-500 mb-4">
              Oops! Something went wrong
            </h1>
            <p className="text-gray-300 mb-6">
              We've been notified and are looking into it. Please try refreshing
              the page.
            </p>
            <button
              onClick={reset}
              type="button"
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-6 rounded transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
        {/* Fallback to Next.js default error component */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}

export default GlobalError;

