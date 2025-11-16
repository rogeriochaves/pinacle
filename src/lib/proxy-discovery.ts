/**
 * Port Discovery for Pod Proxy
 *
 * Generates helpful error pages when a port is not available,
 * showing users what ports are actually running in their pod.
 */

import { eq } from "drizzle-orm";
import { db } from "./db";
import { pods } from "./db/schema";
import { proxyLogger } from "./logger";
import type { PinacleConfig } from "./pod-orchestration/pinacle-config";
import { PodProvisioningService } from "./pod-orchestration/pod-provisioning-service";
import {
  SERVICE_TEMPLATES,
  type ServiceId,
} from "./pod-orchestration/service-registry";
import { getProxyInjectionScript } from "./proxy-injection-script";
import type { ProxyTokenPayload } from "./proxy-token";

/**
 * Detect available ports in a pod and generate a friendly HTML page
 */
export const generatePortDiscoveryPage = async (
  payload: ProxyTokenPayload,
  requestedPort: number,
  baseDomain: string,
): Promise<string | null> => {
  try {
    // Get pod details
    const [pod] = await db
      .select({
        id: pods.id,
        slug: pods.slug,
        name: pods.name,
        serverId: pods.serverId,
        containerId: pods.containerId,
        config: pods.config,
      })
      .from(pods)
      .where(eq(pods.id, payload.podId))
      .limit(1);

    if (!pod || !pod.serverId || !pod.containerId) {
      return null;
    }

    // Get server connection using the provisioning service utility
    const provisioningService = new PodProvisioningService();
    const serverConnection =
      await provisioningService.getServerConnectionDetails(pod.serverId);

    // Execute netstat in the pod to find available ports
    const netstatCmd = `docker exec ${pod.containerId} netstat -tulpen 2>/dev/null || echo "ERROR"`;
    const result = await serverConnection.exec(netstatCmd);

    if (result.stdout.includes("ERROR")) {
      return null;
    }

    // Parse netstat output to extract ports
    type PortInfo = {
      port: number;
      processName: string;
    };

    const availablePorts: PortInfo[] = [];
    const lines = result.stdout.split("\n");

    for (const line of lines) {
      // Match lines like: tcp        0      0 0.0.0.0:5173            0.0.0.0:*               LISTEN      809/node
      const match = line.match(
        /tcp\s+\d+\s+\d+\s+0\.0\.0\.0:(\d+)\s+.*LISTEN\s+\d+\/(.+)/,
      );
      if (match) {
        const port = Number.parseInt(match[1], 10);
        const processName = match[2].trim();

        // Skip port 80 (nginx)
        if (port === 80) continue;

        availablePorts.push({ port, processName });
      }
    }

    // Sort ports numerically
    availablePorts.sort((a, b) => a.port - b.port);

    // Parse the pod config to get services and processes
    let podConfig: PinacleConfig | null = null;
    try {
      podConfig = JSON.parse(pod.config);
    } catch {
      // If config parsing fails, just use netstat process names
    }

    const portEntries = availablePorts.map((portInfo) => {
      let displayName = portInfo.processName; // Default to netstat process name
      let type: "process" | "service" | "other" = "other";

      if (podConfig) {
        // Check if port matches a configured process first
        const matchingProcess = podConfig.processes?.find((p) => {
          if (!p.url) return false;
          // Extract port from URL (e.g., "http://localhost:5173" -> 5173)
          const match = p.url.match(/:(\d+)/);
          return match && Number.parseInt(match[1], 10) === portInfo.port;
        });

        if (matchingProcess) {
          displayName = matchingProcess.name;
          type = "process";
        } else {
          // Check if port matches a configured service from registry
          const matchingService = podConfig.services?.find((serviceId) => {
            const template = SERVICE_TEMPLATES[serviceId as ServiceId];
            return template && template.defaultPort === portInfo.port;
          });

          if (matchingService) {
            const template = SERVICE_TEMPLATES[matchingService as ServiceId];
            displayName = template.displayName;
            type = "service";
          }
        }
      }

      // Build full proxy URL (works in new tab, will be intercepted in iframe)
      const proxyUrl = `http://localhost-${portInfo.port}-pod-${pod.slug}.${baseDomain}`;

      return {
        port: portInfo.port,
        name: displayName,
        url: proxyUrl,
        type,
      };
    });

    // Sort: processes first, then services, then others
    portEntries.sort((a, b) => {
      const typeOrder = { process: 0, service: 1, other: 2 };
      return typeOrder[a.type] - typeOrder[b.type];
    });

    // Generate HTML with injection script
    const injectionScript = getProxyInjectionScript(); // No nonce needed for static page

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>502 Bad Gateway</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 50px;
    }
    h1 {
      font-size: 24px;
    }
    h2 {
      font-size: 18px;
    }
    p {
      margin: 10px 0;
    }
    ul {
      margin: 20px 0;
    }
    li {
      margin: 5px 0;
    }
    a {
      color: #0066cc;
      cursor: pointer;
    }
    hr {
      margin: 30px 0;
      border: 0;
      border-top: 1px solid #ccc;
    }
  </style>
  ${injectionScript}
  <script>
    // Intercept link clicks and send postMessage to parent
    document.addEventListener('DOMContentLoaded', function() {
      document.querySelectorAll('a[data-port]').forEach(function(link) {
        link.addEventListener('click', function(e) {
          e.preventDefault();
          const port = parseInt(link.getAttribute('data-port'), 10);
          window.parent.postMessage({
            type: 'pinacle-navigate-port',
            port: port
          }, '*');
        });
      });
    });
  </script>
</head>
<body>
  <h1>⚠️ 502 Bad Gateway</h1>
  <p>Port ${requestedPort} is not responding on pod, maybe your server died?</p>
  <p>Make sure your application is running and listening on <strong>0.0.0.0:${requestedPort}</strong> inside the pod.</p>

  <hr>

  <h2>Detected Active Ports:</h2>
  ${
    portEntries.length > 0
      ? `
  <ul>
${portEntries
  .map(
    (entry) =>
      `    <li>${entry.name}: <a href="${entry.url}" data-port="${entry.port}">localhost:${entry.port}</a></li>`,
  )
  .join("\n")}
  </ul>
  `
      : `
  <p>No ports are currently listening in this pod. Start a service to see it here.</p>
  `
  }
</body>
</html>
    `.trim();

    return html;
  } catch (error) {
    proxyLogger.error({ err: error }, "Failed to generate port discovery page");
    return null;
  }
};
