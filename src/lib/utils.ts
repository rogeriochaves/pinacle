import { type ClassValue, clsx } from "clsx";
// biome-ignore lint/style/useNodejsImportProtocol: we use crypto in the browser too
import crypto from "crypto";
import ksuid from "ksuid";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const generateKSUID = (resource: string): string => {
  const randomPart = crypto.randomBytes(16);
  return `${resource}_${ksuid.fromParts(Date.now(), randomPart).string}`;
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

/**
 * Get the project folder from a repository URL
 *
 * @param repository - The repository URL
 * @returns The project folder
 */
export const getProjectFolderFromRepository = (
  repository: string | undefined,
): string | undefined => {
  // Works for urls like:
  // - git@github.com:owner/repo.git
  // - https://github.com/owner/repo.git
  // - owner/repo
  return repository ? /.*\/(.*?)(\.git)?$/.exec(repository)?.[1] : undefined;
};
