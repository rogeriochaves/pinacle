"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Component that monitors GitHub token health and prompts re-authentication
 * when the token expires. Provides a seamless re-auth flow that returns
 * the user to their current page.
 */
export const GitHubTokenRefresh = () => {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleReauth = useCallback(() => {
    if (isRefreshing) return; // Prevent multiple redirects
    
    setIsRefreshing(true);
    
    // Store the current URL to return to after re-auth
    const returnUrl = encodeURIComponent(pathname || "/dashboard");
    
    // Redirect to GitHub OAuth with automatic re-auth
    // Using callbackUrl to return to current page
    window.location.href = `/api/auth/signin/github?callbackUrl=${returnUrl}`;
  }, [isRefreshing, pathname]);

  useEffect(() => {
    // Only check for authenticated GitHub users
    if (status !== "authenticated" || !session?.user?.githubAccessToken) {
      return;
    }

    // Check if token has expired
    if (session.error === "github_token_expired") {
      console.log("[GitHubTokenRefresh] Token expired, initiating re-auth...");
      handleReauth();
    }
  }, [session, status, handleReauth]);

  // This component doesn't render anything - it just monitors and redirects
  return null;
};

