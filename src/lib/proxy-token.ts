/**
 * Scoped JWT tokens for pod proxy access
 *
 * These tokens are:
 * - Short-lived (15 minutes default)
 * - Scoped to specific pod + port
 * - Cannot be used for account access
 * - Safe to expose to untrusted pod environments
 */

import jwt from "jsonwebtoken";

export type ProxyTokenPayload = {
  userId: string;
  podId: string;
  podSlug: string;
  targetPort: number;
  exp: number; // Unix timestamp
  iat: number; // Unix timestamp
};

const TOKEN_SECRET =
  process.env.NEXTAUTH_SECRET || "fallback-secret-change-in-production";
const TOKEN_EXPIRY = 15 * 60; // 15 minutes in seconds

/**
 * Generate a scoped JWT token for pod proxy access
 *
 * @param userId - The user ID
 * @param podId - The pod ID
 * @param podSlug - The pod slug
 * @param targetPort - The target port to access
 * @returns Signed JWT token
 */
export const generateProxyToken = (
  userId: string,
  podId: string,
  podSlug: string,
  targetPort: number,
): string => {
  const payload: Omit<ProxyTokenPayload, "exp" | "iat"> = {
    userId,
    podId,
    podSlug,
    targetPort,
  };

  return jwt.sign(payload, TOKEN_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });
};

/**
 * Verify and decode a proxy token
 *
 * @param token - The JWT token to verify
 * @returns Decoded payload or null if invalid
 */
export const verifyProxyToken = (token: string): ProxyTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, TOKEN_SECRET) as ProxyTokenPayload;
    return decoded;
  } catch (error) {
    console.error("Invalid proxy token:", error);
    return null;
  }
};

/**
 * Check if a token is about to expire (within 5 minutes)
 *
 * @param token - Decoded token payload
 * @returns True if token expires soon
 */
export const isTokenExpiringSoon = (token: ProxyTokenPayload): boolean => {
  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = token.exp - now;
  return timeUntilExpiry < 5 * 60; // Less than 5 minutes
};

/**
 * Build proxy URL with token
 *
 * @param podSlug - The pod slug
 * @param port - The target port
 * @param token - The JWT token
 * @param domain - Base domain (defaults to env var or localhost)
 * @param embed - Whether this is for iframe embedding (affects cookie SameSite)
 * @param returnUrl - The URL to return to after authentication
 * @returns Full proxy URL with token
 */
export const buildProxyCallbackUrl = ({
  podSlug,
  port,
  token,
  embed,
  returnUrl,
  domain,
}: {
  podSlug: string;
  port: number;
  token: string;
  embed?: boolean;
  returnUrl?: string;
  domain?: string;
}): string => {
  const isDevelopment = process.env.NODE_ENV === "development";
  const baseDomain =
    domain ||
    process.env.NEXT_PUBLIC_APP_DOMAIN ||
    (isDevelopment ? "localhost:3000" : "pinacle.dev");

  // Format: http://localhost-{PORT}.pod-{SLUG}.{DOMAIN}/pinacle-proxy-callback?token={TOKEN}&embed=true
  const embedParam = embed ? "&embed=true" : "";
  const returnUrlParam = returnUrl
    ? `&return_url=${encodeURIComponent(returnUrl)}`
    : "";
  return `http://localhost-${port}.pod-${podSlug}.${baseDomain}/pinacle-proxy-callback?token=${token}${embedParam}${returnUrlParam}`;
};

/**
 * Build proxy URL
 *
 * @param podSlug - The pod slug
 * @param port - The target port
 * @param domain - Base domain (defaults to env var or localhost)
 * @param returnUrl - The URL to return to after authentication
 * @returns Full proxy URL
 */
export const buildProxyUrl = ({
  podSlug,
  port,
  returnUrl,
  domain,
}: {
  podSlug: string;
  port: number;
  returnUrl?: string;
  domain?: string;
}): string => {
  const isDevelopment = process.env.NODE_ENV === "development";
  const baseDomain =
    domain ||
    process.env.NEXT_PUBLIC_APP_DOMAIN ||
    (isDevelopment ? "localhost:3000" : "pinacle.dev");

  // Format: http://localhost-{PORT}.pod-{SLUG}.{DOMAIN}
  return `http://localhost-${port}.pod-${podSlug}.${baseDomain}${returnUrl ?? "/"}`;
};
