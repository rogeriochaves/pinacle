"use client";

import { usePathname } from "next/navigation";
import { signIn } from "next-auth/react";
import { useCallback, useState } from "react";

/**
 * Hook for handling GitHub re-authentication flow.
 * 
 * When the GitHub OAuth token expires, this hook provides a function to
 * re-authenticate with GitHub and return the user to the current page.
 * 
 * @example
 * ```tsx
 * const { reauthenticate, isReauthenticating } = useGitHubReauth();
 * 
 * <button onClick={reauthenticate} disabled={isReauthenticating}>
 *   Re-authenticate with GitHub
 * </button>
 * ```
 */
export const useGitHubReauth = () => {
  const pathname = usePathname();
  const [isReauthenticating, setIsReauthenticating] = useState(false);

  const reauthenticate = useCallback(async () => {
    setIsReauthenticating(true);
    
    // Store the current URL to return to after re-auth
    const returnUrl = pathname || "/dashboard";

    // Directly trigger GitHub OAuth sign-in
    // NextAuth will handle updating the session with the new token
    await signIn("github", {
      callbackUrl: returnUrl,
    });
  }, [pathname]);

  return {
    reauthenticate,
    isReauthenticating,
  };
};

