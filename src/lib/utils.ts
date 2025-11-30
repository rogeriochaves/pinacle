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
 * Build the pod host portion of proxy URLs
 * Format: pod-{SLUG}.{DOMAIN}
 *
 * This is the stable identifier that users can use to construct proxy URLs,
 * exposed as PINACLE_POD_HOST environment variable inside pods.
 *
 * @param podSlug - The pod slug
 * @param domain - Base domain (defaults to env var or pinacle.dev)
 * @returns Pod host string (e.g., "pod-my-slug.pinacle.dev")
 */
export const buildPodHost = ({
  podSlug,
  domain,
}: {
  podSlug: string;
  domain?: string;
}): string => {
  const baseDomain =
    domain || process.env.NEXTAUTH_URL?.split("://")[1] || "pinacle.dev";

  return `pod-${podSlug}.${baseDomain}`;
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
  const podHost = buildPodHost({ podSlug, domain });

  // Format: http://localhost-{PORT}-{POD_HOST}
  return `http://localhost-${port}-${podHost}${returnUrl ?? "/"}`;
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
