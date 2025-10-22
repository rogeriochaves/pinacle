/**
 * Utility functions for detecting GitHub authentication errors
 */

/**
 * Check if an error message indicates expired or invalid GitHub credentials
 * Detects various error patterns from GitHub API
 */
export const isGitHubAuthError = (errorMessage: string | null | undefined): boolean => {
  if (!errorMessage) return false;

  const lowerMessage = errorMessage.toLowerCase();

  return (
    errorMessage.includes("GITHUB_AUTH_EXPIRED") ||
    errorMessage.includes("Bad credentials") ||
    lowerMessage.includes("authentication") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("invalid token") ||
    lowerMessage.includes("token expired")
  );
};

