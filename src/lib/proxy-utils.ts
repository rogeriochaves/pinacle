/**
 * Proxy utilities for authenticated subdomain-based routing
 *
 * URL format: localhost-{PORT}.pod-{SLUG}.{DOMAIN}
 * Examples:
 *   - localhost-8080.pod-myslug.pinacle.dev
 *   - localhost-3000.pod-test-pod.localhost:3000 (dev mode)
 */

import { and, eq } from "drizzle-orm";
import type { Session } from "next-auth";
import { db } from "./db";
import { pods, teamMembers } from "./db/schema";

export type ParsedProxyHostname = {
  port: number;
  podSlug: string;
  isValid: boolean;
  error?: string;
};

/**
 * Parse a proxy hostname to extract target port and pod slug
 *
 * @param hostname - The hostname from the request (e.g., "localhost-8080.pod-myslug.pinacle.dev")
 * @returns Parsed components or error
 */
export const parseProxyHostname = (hostname: string): ParsedProxyHostname => {
  // Remove port number if present (e.g., "localhost-8080.pod-myslug.localhost:3000" -> "localhost-8080.pod-myslug.localhost")
  const hostWithoutPort = hostname.split(":")[0];

  // Pattern: localhost-{PORT}.pod-{SLUG}.{DOMAIN}
  // Examples:
  //   - localhost-8080.pod-myslug.pinacle.dev
  //   - localhost-3000.pod-test-pod.localhost
  const pattern = /^localhost-(\d+)\.pod-([^.]+)\./;
  const match = hostWithoutPort.match(pattern);

  if (!match) {
    return {
      port: 0,
      podSlug: "",
      isValid: false,
      error: `Invalid proxy hostname format: ${hostname}. Expected: localhost-{PORT}.pod-{SLUG}.{DOMAIN}`,
    };
  }

  const port = Number.parseInt(match[1], 10);
  const podSlug = match[2];

  if (Number.isNaN(port) || port < 1 || port > 65535) {
    return {
      port: 0,
      podSlug,
      isValid: false,
      error: `Invalid port number: ${match[1]}`,
    };
  }

  if (!podSlug) {
    return {
      port,
      podSlug: "",
      isValid: false,
      error: "Pod slug is empty",
    };
  }

  return {
    port,
    podSlug,
    isValid: true,
  };
};

/**
 * Authorization utilities
 */

export type PodAccessCheckResult = {
  hasAccess: boolean;
  pod?: {
    id: string;
    name: string;
    slug: string;
    teamId: string;
    ownerId: string;
    serverId: string | null;
    containerId: string | null;
    status: string;
    ports: string | null;
  };
  reason?: string;
};

/**
 * Check if a user has access to a pod
 * User has access if they are:
 * 1. The owner of the pod
 * 2. A member of the team that owns the pod
 *
 * @param userId - The user ID
 * @param podSlug - The pod slug
 * @returns Access check result with pod details if authorized
 */
export const checkPodAccess = async (
  userId: string,
  podSlug: string,
): Promise<PodAccessCheckResult> => {
  // Look up the pod
  const [pod] = await db
    .select({
      id: pods.id,
      name: pods.name,
      slug: pods.slug,
      teamId: pods.teamId,
      ownerId: pods.ownerId,
      serverId: pods.serverId,
      containerId: pods.containerId,
      status: pods.status,
      ports: pods.ports,
    })
    .from(pods)
    .where(eq(pods.slug, podSlug))
    .limit(1);

  if (!pod) {
    return {
      hasAccess: false,
      reason: "Pod not found",
    };
  }

  // Check if user is the owner
  if (pod.ownerId === userId) {
    return {
      hasAccess: true,
      pod,
    };
  }

  // Check if user is a team member
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(
      and(eq(teamMembers.teamId, pod.teamId), eq(teamMembers.userId, userId)),
    )
    .limit(1);

  if (membership) {
    return {
      hasAccess: true,
      pod,
    };
  }

  return {
    hasAccess: false,
    reason: "User is not authorized to access this pod",
  };
};

/**
 * Check if a session has access to a pod
 *
 * @param session - NextAuth session (can be null if not authenticated)
 * @param podSlug - The pod slug
 * @returns Access check result
 */
export const checkSessionPodAccess = async (
  session: Session | null,
  podSlug: string,
): Promise<PodAccessCheckResult> => {
  if (!session?.user?.id) {
    return {
      hasAccess: false,
      reason: "Not authenticated",
    };
  }

  return checkPodAccess(session.user.id, podSlug);
};
