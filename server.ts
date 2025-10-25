/**
 * Custom Next.js server with authenticated proxy
 *
 * This server:
 * 1. Wraps Next.js for normal app routes
 * 2. Handles subdomain-based proxy requests with JWT authentication
 * 3. Supports full WebSocket proxying
 * 4. Sets scoped cookies per pod+port
 *
 * Port configuration:
 * - 3000: Main Next.js app
 * - 3001: Proxy server (handles subdomain requests)
 */

import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { parse } from "node:url";
import { eq } from "drizzle-orm";
import httpProxy from "http-proxy";
import next from "next";
import { db } from "./src/lib/db";
import { pods, servers } from "./src/lib/db/schema";
import { logger, proxyLogger } from "./src/lib/logger";
import {
  type ProxyTokenPayload,
  verifyProxyToken,
} from "./src/lib/proxy-token";
import { parseProxyHostname } from "./src/lib/proxy-utils";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000; // Single port for both app and proxy

// Cookie names for scoped authentication
const PROXY_TOKEN_COOKIE = "pinacle-proxy-token";

// Proxy cache configuration
const PROXY_CACHE_TTL_MS = 30 * 1000; // 30 seconds (short TTL to detect port changes after pod recreation)

// Proxy cache to avoid recreating proxies for every request
const proxyCache = new Map<
  string,
  {
    proxy: httpProxy;
    createdAt: number;
    podId: string;
  }
>();

/**
 * Parse cookie header
 */
const parseCookies = (
  cookieHeader: string | undefined,
): Record<string, string> => {
  if (!cookieHeader) return {};

  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.split("=");
    if (name && rest.length > 0) {
      cookies[name.trim()] = rest.join("=").trim();
    }
  });

  return cookies;
};

/**
 * Set a cookie in the response
 */
const setCookie = (
  res: ServerResponse,
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "strict" | "lax" | "none";
    maxAge?: number; // seconds
    path?: string;
    partitioned?: boolean; // CHIPS support
  } = {},
): void => {
  const cookieParts = [`${name}=${value}`];

  if (options.httpOnly) cookieParts.push("HttpOnly");
  if (options.secure) cookieParts.push("Secure");
  if (options.sameSite) cookieParts.push(`SameSite=${options.sameSite}`);
  if (options.maxAge) cookieParts.push(`Max-Age=${options.maxAge}`);
  if (options.path) cookieParts.push(`Path=${options.path}`);
  if (options.partitioned) cookieParts.push("Partitioned");

  res.setHeader("Set-Cookie", cookieParts.join("; "));
};

/**
 * Handle /callback endpoint - validate JWT and set scoped cookie
 */
const handleCallback = async (
  _req: IncomingMessage,
  res: ServerResponse,
  hostname: string,
  url: URL,
): Promise<boolean> => {
  if (!url.pathname.startsWith("/pinacle-proxy-callback")) {
    return false;
  }

  try {
    // Get token from query string
    const token = url.searchParams.get("token");
    if (!token) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing token parameter" }));
      return true;
    }

    // Check if this is an iframe embed
    const embedParam = url.searchParams.get("embed");
    const isEmbed = embedParam === "true";

    // Verify token
    const payload = verifyProxyToken(token);
    if (!payload) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or expired token" }));
      return true;
    }

    // Parse hostname to get pod and port
    const parsed = parseProxyHostname(hostname);
    if (!parsed.isValid) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: parsed.error }));
      return true;
    }

    // Verify token matches the hostname
    if (
      parsed.podSlug !== payload.podSlug ||
      parsed.port !== payload.targetPort
    ) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Token does not match requested pod/port",
        }),
      );
      return true;
    }

    // Set scoped cookie with conditional settings based on embed context
    if (isEmbed) {
      // Iframe embedding: Use CHIPS (Partitioned cookie) with SameSite=None
      // This allows cross-site access while partitioning by top-level site
      // Prevents malicious pods from accessing cookies from other top-level contexts
      setCookie(res, PROXY_TOKEN_COOKIE, token, {
        httpOnly: true,
        secure: true, // Required for SameSite=None and Partitioned
        sameSite: "none", // Allow cross-site for iframe embedding
        partitioned: true, // CHIPS: Partition by top-level site
        maxAge: 15 * 60, // 15 minutes
        path: "/",
      });
    } else {
      // Top-level navigation: Use SameSite=Lax (more secure)
      setCookie(res, PROXY_TOKEN_COOKIE, token, {
        httpOnly: true,
        secure: !dev,
        sameSite: "lax", // Prevents CSRF attacks
        maxAge: 15 * 60, // 15 minutes
        path: "/",
      });
    }

    proxyLogger.info(
      {
        userId: payload.userId,
        podSlug: payload.podSlug,
        targetPort: payload.targetPort,
        isEmbed,
        cookieType: isEmbed ? "SameSite=None;Partitioned" : "SameSite=Lax",
      },
      "Set proxy cookie for user",
    );

    const returnUrl = url.searchParams.get("return_url");

    // Redirect to root (remove token from URL)
    res.writeHead(302, {
      Location: returnUrl || "/",
      "Content-Type": "text/html",
    });
    res.end("<html><body>Redirecting...</body></html>");
    return true;
  } catch (error) {
    proxyLogger.error({ err: error }, "Callback error");
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
    return true;
  }
};

/**
 * Clean up an expired proxy instance
 */
const cleanupProxy = (proxy: httpProxy, cacheKey: string): void => {
  try {
    proxyLogger.debug({ cacheKey }, "Cleaning up expired proxy");

    // Remove all event listeners
    proxy.removeAllListeners();

    // Close the proxy
    proxy.close();

    proxyLogger.debug({ cacheKey }, "Proxy cleaned up successfully");
  } catch (err) {
    proxyLogger.error({ err, cacheKey }, "Error cleaning up proxy");
  }
};

/**
 * Get or create a cached proxy for a specific pod
 */
const getOrCreatePodProxy = async (
  payload: ProxyTokenPayload,
): Promise<httpProxy | null> => {
  // Create cache key from pod + target port
  const cacheKey = `${payload.podId}:${payload.targetPort}`;

  // Check if we have a valid cached proxy
  const cached = proxyCache.get(cacheKey);
  if (cached) {
    const age = Date.now() - cached.createdAt;

    // Check if proxy has expired
    if (age > PROXY_CACHE_TTL_MS) {
      proxyLogger.info(
        {
          podSlug: payload.podSlug,
          targetPort: payload.targetPort,
          ageMs: age,
        },
        "Proxy expired, cleaning up and recreating",
      );

      // Clean up the old proxy
      cleanupProxy(cached.proxy, cacheKey);

      // Remove from cache
      proxyCache.delete(cacheKey);

      // Fall through to create new proxy
    } else {
      proxyLogger.debug(
        {
          podSlug: payload.podSlug,
          targetPort: payload.targetPort,
          ageMs: age,
        },
        "Using cached proxy",
      );
      return cached.proxy;
    }
  }

  // Create new proxy
  const proxy = await createPodProxy(payload);

  if (proxy) {
    // Cache it
    proxyCache.set(cacheKey, {
      proxy,
      createdAt: Date.now(),
      podId: payload.podId,
    });
  }

  return proxy;
};

/**
 * Create raw http-proxy for a specific pod
 */
const createPodProxy = async (
  payload: ProxyTokenPayload,
): Promise<httpProxy | null> => {
  try {
    // Get pod details
    const [pod] = await db
      .select({
        id: pods.id,
        serverId: pods.serverId,
        ports: pods.ports,
      })
      .from(pods)
      .where(eq(pods.id, payload.podId))
      .limit(1);

    if (!pod || !pod.serverId) {
      proxyLogger.error(
        { podId: payload.podId },
        "Pod not found or has no server",
      );
      return null;
    }

    // Get server details
    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, pod.serverId))
      .limit(1);

    if (!server) {
      proxyLogger.error({ serverId: pod.serverId }, "Server not found");
      return null;
    }

    // Parse pod ports to get nginx proxy port
    const portMappings = JSON.parse(pod.ports || "[]") as Array<{
      name: string;
      internal: number;
      external: number;
    }>;

    const nginxProxy = portMappings.find((p) => p.name === "nginx-proxy");
    if (!nginxProxy) {
      proxyLogger.error(
        { podId: payload.podId },
        "Nginx proxy port not found for pod",
      );
      return null;
    }

    // Determine target host
    const isLimaVm = !!server.limaVmName;
    const targetHost = isLimaVm ? "127.0.0.1" : server.ipAddress;
    const targetPort = nginxProxy.external;

    proxyLogger.info(
      {
        targetHost,
        targetPort,
        podSlug: payload.podSlug,
        podTargetPort: payload.targetPort,
      },
      "Creating proxy connection",
    );

    // Create raw http-proxy server
    const proxy = httpProxy.createProxyServer({
      target: `http://${targetHost}:${targetPort}`,
      ws: true,
      changeOrigin: true,
      selfHandleResponse: true, // We'll handle the response manually to inject scripts
    });

    // Set Host header for hostname-based routing (HTTP)
    proxy.on("proxyReq", (proxyReq) => {
      proxyReq.setHeader(
        "Host",
        `localhost-${payload.targetPort}.pod-${payload.podSlug}.pinacle.dev`,
      );

      // Remove accept-encoding to get uncompressed responses we can modify
      proxyReq.removeHeader("accept-encoding");
    });

    // Set Host header for WebSocket upgrades
    proxy.on("proxyReqWs", (proxyReq) => {
      proxyReq.setHeader(
        "Host",
        `localhost-${payload.targetPort}.pod-${payload.podSlug}.pinacle.dev`,
      );
    });

    // Handle response - inject scripts into HTML and forward everything else
    proxy.on("proxyRes", (proxyRes, _req, res) => {
      // Remove any COOP headers set by the pod service to allow maximum flexibility
      // This prevents COOP policy conflicts when opening external URLs (like OAuth)
      delete proxyRes.headers["cross-origin-opener-policy"];

      // Remove restrictive frame options if present
      delete proxyRes.headers["x-frame-options"];

      // Check if this is an HTML response
      const contentType = proxyRes.headers["content-type"] || "";
      const isHtml = contentType.includes("text/html");

      if (isHtml) {
        // Generate a unique nonce for this request
        const nonce = randomBytes(16).toString("base64");

        // Modify CSP header to allow our nonce-based inline script
        const csp = proxyRes.headers["content-security-policy"];
        if (csp) {
          const cspStr = Array.isArray(csp) ? csp.join("; ") : csp;
          // Add our nonce to the script-src directive
          const modifiedCsp = cspStr.replace(
            /script-src ([^;]+)/,
            `script-src $1 'nonce-${nonce}'`,
          );
          proxyRes.headers["content-security-policy"] = modifiedCsp;
        }

        // Buffer HTML responses to inject our focus script
        const chunks: Buffer[] = [];

        proxyRes.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });

        proxyRes.on("end", () => {
          try {
            const body = Buffer.concat(chunks).toString("utf8");

            // Script to listen for focus messages from parent (with nonce)
            const focusScript = `
<script nonce="${nonce}">
(function() {
  // Forward keyboard shortcuts from iframe to parent
  window.addEventListener('keydown', function(event) {
    // Only forward Cmd/Ctrl + number shortcuts
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
      const key = event.key;
      const num = parseInt(key, 10);

      if (num >= 1 && num <= 9) {
        // Prevent default browser behavior (tab switching)
        event.preventDefault();
        
        // Forward to parent window
        window.parent.postMessage({
          type: 'pinacle-keyboard-shortcut',
          key: key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey
        }, '*');
      }
    }
  });

  // Listen for focus messages from parent window
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'pinacle-focus') {
      // Try multiple methods to ensure focus works
      window.focus();
      document.body.focus();

      // If VS Code, focus the open tab
      const openTab = document.querySelector(".tabs-and-actions-container .tab.active.selected a");
      if (openTab) {
        const syntheticEvent = new PointerEvent("mousedown", { bubbles: true, cancelable: true });
        openTab.dispatchEvent(syntheticEvent);
      } else {
        // Find first focusable element and focus it
        const focusable = document.querySelector('input, textarea, [contenteditable], [tabindex]:not([tabindex="-1"])');
        if (focusable) {
          focusable.focus();
        }
      }

      // Dispatch a custom event that apps can listen to
      window.dispatchEvent(new CustomEvent('pinacle-focused'));
    }

    if (event.data && event.data.type === 'pinacle-source-control-view') {
      const sourceControlViewIcon = document.querySelector(".action-label.codicon.codicon-source-control-view-icon");
      if (sourceControlViewIcon && !sourceControlViewIcon.parentElement?.classList.contains("checked")) {
        sourceControlViewIcon.click();
        let attempts = 0;
        let searchInterval = setInterval(() => {
          const resourceGroup = document.querySelector(".resource-group");
          if (resourceGroup) {
            clearInterval(searchInterval);
            setTimeout(() => {
              const firstModifiedFile = document.querySelector(".resource[data-tooltip='Modified']");
              if (firstModifiedFile) {
                firstModifiedFile.click();
              }
            }, attempts > 0 ? 2000 : 500);
          }
          attempts++;
          if (attempts > 10) {
            clearInterval(searchInterval);
          }
        }, 1000);
      } else {
        // alreaty opened or not found, do nothing
      }
    }
  });
})();
</script>`;

            // Inject script right after <head> or at the start of <body> or beginning of document
            let modifiedBody = body;
            if (body.includes("<head>")) {
              modifiedBody = body.replace("<head>", `<head>${focusScript}`);
            } else if (body.includes("<body>")) {
              modifiedBody = body.replace("<body>", `<body>${focusScript}`);
            } else if (body.includes("<html>")) {
              modifiedBody = body.replace("<html>", `<html>${focusScript}`);
            } else {
              // Prepend to the beginning
              modifiedBody = focusScript + body;
            }

            // Copy all headers except content-length (which we'll update)
            Object.keys(proxyRes.headers).forEach((key) => {
              if (key.toLowerCase() !== "content-length") {
                const value = proxyRes.headers[key];
                if (value !== undefined) {
                  res.setHeader(key, value);
                }
              }
            });

            // Set status code
            res.statusCode = proxyRes.statusCode || 200;

            // Update content-length and send modified response
            res.setHeader("content-length", Buffer.byteLength(modifiedBody));
            res.end(modifiedBody);

            proxyLogger.debug(
              { podSlug: payload.podSlug, port: payload.targetPort },
              "Injected focus script into HTML response",
            );
          } catch (err) {
            proxyLogger.error(
              { err, podSlug: payload.podSlug, port: payload.targetPort },
              "Error injecting focus script",
            );
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end("Internal Server Error");
            }
          }
        });

        proxyRes.on("error", (err) => {
          proxyLogger.error(
            { err, podSlug: payload.podSlug, port: payload.targetPort },
            "ProxyRes stream error",
          );
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end("Internal Server Error");
          }
        });
      } else {
        // For non-HTML responses, forward everything as-is
        // Copy all headers
        Object.keys(proxyRes.headers).forEach((key) => {
          const value = proxyRes.headers[key];
          if (value !== undefined) {
            res.setHeader(key, value);
          }
        });

        // Set status code
        res.statusCode = proxyRes.statusCode || 200;

        // Pipe the response through
        proxyRes.pipe(res);
      }
    });

    // Handle HTTP proxy errors
    proxy.on("error", (err, _req, res) => {
      proxyLogger.error(
        { err, podSlug: payload.podSlug, port: payload.targetPort },
        "HTTP proxy error",
      );
      // res can be either ServerResponse (HTTP) or Socket (WebSocket)
      // Only try to send HTTP response if it's actually an HTTP response
      if (
        res &&
        "writeHead" in res &&
        typeof res.writeHead === "function" &&
        !res.headersSent
      ) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Bad Gateway" }));
      } else if (res && "destroy" in res) {
        // It's a socket (WebSocket), just destroy it
        res.destroy();
      }
    });

    return proxy;
  } catch (error) {
    proxyLogger.error({ err: error }, "Error creating proxy");
    return null;
  }
};

/**
 * Handle proxy requests (all requests to subdomains)
 */
const handleProxy = async (
  req: IncomingMessage,
  res: ServerResponse,
  hostname: string,
): Promise<void> => {
  try {
    // Parse hostname to get pod and port info
    const parsed = parseProxyHostname(hostname);
    if (!parsed.isValid) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: parsed.error }));
      return;
    }

    // Get cookie
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[PROXY_TOKEN_COOKIE];

    if (!token) {
      // No token - redirect to auth endpoint to get one
      const authUrl = `http://localhost:${port}/api/proxy-auth?pod=${encodeURIComponent(parsed.podSlug)}&port=${parsed.port}&return_url=${encodeURIComponent(req.url || "/")}`;
      res.writeHead(302, {
        Location: authUrl,
        "Content-Type": "text/html",
      });
      res.end(`<html><body>Redirecting to authenticate...</body></html>`);
      return;
    }

    // Verify token
    const payload = verifyProxyToken(token);
    if (!payload) {
      // Invalid/expired token - redirect to auth to get a new one
      const authUrl = `http://localhost:${port}/api/proxy-auth?pod=${encodeURIComponent(parsed.podSlug)}&port=${parsed.port}&return_url=${encodeURIComponent(req.url || "/")}`;
      res.writeHead(302, {
        Location: authUrl,
        "Content-Type": "text/html",
      });
      res.end(
        `<html><body>Token expired, redirecting to authenticate...</body></html>`,
      );
      return;
    }

    // Verify token matches hostname
    if (
      parsed.podSlug !== payload.podSlug ||
      parsed.port !== payload.targetPort
    ) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Token does not match requested pod/port",
        }),
      );
      return;
    }

    // Get or create cached proxy
    const proxy = await getOrCreatePodProxy(payload);
    if (!proxy) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Pod proxy unavailable" }));
      return;
    }

    // Proxy the request using raw http-proxy
    proxyLogger.debug(
      { podSlug: payload.podSlug, port: payload.targetPort, url: req.url },
      "Proxying HTTP request",
    );
    proxy.web(req, res);
  } catch (error) {
    proxyLogger.error({ err: error }, "Handle proxy error");
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
};

/**
 * Main server setup
 */
const startServer = async (): Promise<void> => {
  // Prepare Next.js
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  // Create unified server that handles both proxy and app routes
  const server = createServer(async (req, res) => {
    try {
      const requestHostname = req.headers.host || "localhost";

      // Check if this is a proxy subdomain request
      const parsed = parseProxyHostname(requestHostname);

      if (parsed.isValid) {
        // This is a proxy request - handle it
        logger.debug({ hostname: requestHostname }, "Detected proxy request");

        const url = new URL(req.url || "/", `http://${requestHostname}`);

        // Handle callback endpoint
        const isCallback = await handleCallback(req, res, requestHostname, url);
        if (isCallback) return;

        // Handle proxy request
        await handleProxy(req, res, requestHostname);
      } else {
        // Not a proxy request - pass to Next.js
        const parsedUrl = parse(req.url || "/", true);
        const listenersBefore = server.listenerCount("upgrade");
        await handle(req, res, parsedUrl);
        const listenersAfter = server.listenerCount("upgrade");
        
        // Detect if Next.js added its upgrade listener (happens after first compilation)
        if (listenersBefore !== listenersAfter && !nextJsUpgradeHandler) {
          logger.debug(
            { before: listenersBefore, after: listenersAfter },
            "Next.js added upgrade listener, storing and removing it to prevent conflicts",
          );
          
          const upgradeListeners = server.listeners("upgrade");
          
          // Next.js's handler is the last one added
          if (upgradeListeners.length >= 2) {
            nextJsUpgradeHandler = upgradeListeners[upgradeListeners.length - 1] as any;
            
            // Remove all listeners and re-add only ours (the first one)
            server.removeAllListeners("upgrade");
            server.on("upgrade", upgradeListeners[0] as any);
            
            logger.debug("Stored Next.js upgrade handler, will call it manually for HMR");
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "Server error");
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  });

  // Store Next.js's upgrade handler when it gets added (after first HTTP request)
  let nextJsUpgradeHandler: ((req: any, socket: any, head: any) => void) | null = null;

  // Handle WebSocket upgrades
  server.on("upgrade", async (req, socket, head) => {
    try {
      const requestHostname = req.headers.host || "localhost";
      const parsed = parseProxyHostname(requestHostname);

      if (parsed.isValid) {
        // This is a proxy WebSocket request
        logger.debug(
          { hostname: requestHostname, url: req.url },
          "WebSocket upgrade request",
        );

        // Get cookie from request
        const cookies = parseCookies(req.headers.cookie);
        const token = cookies[PROXY_TOKEN_COOKIE];

        if (!token) {
          logger.error("WebSocket upgrade failed: No token");
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        // Verify token
        const payload = verifyProxyToken(token);
        if (!payload) {
          logger.error("WebSocket upgrade failed: Invalid token");
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        // Verify token matches hostname
        if (
          parsed.podSlug !== payload.podSlug ||
          parsed.port !== payload.targetPort
        ) {
          logger.error(
            {
              expected: { podSlug: parsed.podSlug, port: parsed.port },
              token: payload,
            },
            "WebSocket upgrade failed: Token mismatch",
          );
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }

        // Get or create cached proxy (same one used for HTTP)
        const proxy = await getOrCreatePodProxy(payload);
        if (!proxy) {
          logger.error("WebSocket upgrade failed: Could not create proxy");
          socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
          socket.destroy();
          return;
        }

        // Upgrade the WebSocket connection using the same proxy
        logger.debug(
          { podSlug: parsed.podSlug, port: parsed.port, url: req.url },
          "Upgrading WebSocket through cached proxy",
        );

        // Add error handler for this specific WebSocket upgrade
        socket.on("error", (err) => {
          proxyLogger.error(
            { err, podSlug: parsed.podSlug, port: parsed.port },
            "WebSocket socket error",
          );
        });

        proxy.ws(req, socket, head);
      } else {
        // Not a proxy request - pass to Next.js HMR handler if available
        if (nextJsUpgradeHandler) {
          logger.debug(
            { hostname: requestHostname, url: req.url },
            "Non-proxy WebSocket upgrade, passing to Next.js HMR",
          );
          nextJsUpgradeHandler(req, socket, head);
        } else {
          // Next.js handler not available yet (before first compilation)
          logger.debug(
            { hostname: requestHostname, url: req.url },
            "Non-proxy WebSocket upgrade but Next.js handler not ready yet",
          );
        }
      }
    } catch (err) {
      logger.error({ err }, "WebSocket upgrade error");
      socket.destroy();
    }
  });

  server.listen(port, () => {
    logger.info({ port, hostname }, "Server ready");
    logger.info(`Next.js app: http://${hostname}:${port}`);
    logger.info(`Proxy: http://localhost-*.pod-*.${hostname}:${port}`);
  });
};

// Start the servers
startServer().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});
