"use client";

import { Loader2 } from "lucide-react";
import { useGitHubReauth } from "../../hooks/use-github-reauth";

type GitHubReauthButtonProps = {
  children?: React.ReactNode;
  className?: string;
};

/**
 * Button component that triggers GitHub re-authentication flow.
 * 
 * When clicked, redirects to GitHub OAuth and returns the user
 * to the current page after successful authentication.
 * 
 * @example
 * ```tsx
 * <GitHubReauthButton />
 * 
 * // Custom styling
 * <GitHubReauthButton className="bg-blue-500">
 *   Refresh GitHub Auth
 * </GitHubReauthButton>
 * ```
 */
export const GitHubReauthButton = ({
  children = "Re-authenticate with GitHub",
  className = "cursor-pointer px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-mono text-xs font-semibold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
}: GitHubReauthButtonProps) => {
  const { reauthenticate, isReauthenticating } = useGitHubReauth();

  return (
    <button
      type="button"
      onClick={reauthenticate}
      disabled={isReauthenticating}
      className={className}
    >
      {isReauthenticating ? (
        <>
          <Loader2 className="inline-block w-4 h-4 mr-2 animate-spin" />
          Redirecting...
        </>
      ) : (
        children
      )}
    </button>
  );
};

