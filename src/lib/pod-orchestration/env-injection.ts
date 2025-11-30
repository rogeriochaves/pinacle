/**
 * Environment Variable Injection Utilities
 *
 * Handles injecting system environment variables into pod containers.
 */

import { buildPodHost } from "../utils";
import type { KataRuntime } from "./container-runtime";

/**
 * Inject PINACLE_POD_HOST environment variable into /etc/profile
 *
 * This allows users to construct proxy URLs inside their applications:
 * ```typescript
 * redirect(`https://localhost-3000-${process.env.PINACLE_POD_HOST}`)
 * ```
 *
 * Also sets NEXT_PUBLIC_PINACLE_POD_HOST for Next.js client-side access.
 *
 * @param runtime - KataRuntime instance for container execution
 * @param podId - The pod ID
 * @param containerId - The container ID
 * @param podSlug - The pod slug for URL construction
 */
export const injectPodHostEnv = async (
  runtime: KataRuntime,
  podId: string,
  containerId: string,
  podSlug: string,
): Promise<void> => {
  const podHost = buildPodHost({ podSlug });

  // Remove any existing entries first (idempotent), then add new ones
  const injectEnvCmd = [
    `sed -i '/^export PINACLE_POD_HOST=/d' /etc/profile`,
    `sed -i '/^export NEXT_PUBLIC_PINACLE_POD_HOST=/d' /etc/profile`,
    `echo 'export PINACLE_POD_HOST="${podHost}"' >> /etc/profile`,
    `echo 'export NEXT_PUBLIC_PINACLE_POD_HOST=$PINACLE_POD_HOST' >> /etc/profile`,
  ].join(" && ");

  await runtime.execInContainer(podId, containerId, ["sh", "-c", injectEnvCmd]);

  console.log(`[EnvInjection] Injected PINACLE_POD_HOST=${podHost} into /etc/profile`);
};

