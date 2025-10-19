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

import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { parse } from "node:url";
import { eq } from "drizzle-orm";
import {
  createProxyMiddleware,
  type RequestHandler,
} from "http-proxy-middleware";
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

// Proxy cache to avoid recreating proxies for every request
const proxyCache = new Map<
  string,
  {
    proxy: RequestHandler;
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
  } = {},
): void => {
  const cookieParts = [`${name}=${value}`];

  if (options.httpOnly) cookieParts.push("HttpOnly");
  if (options.secure) cookieParts.push("Secure");
  if (options.sameSite) cookieParts.push(`SameSite=${options.sameSite}`);
  if (options.maxAge) cookieParts.push(`Max-Age=${options.maxAge}`);
  if (options.path) cookieParts.push(`Path=${options.path}`);

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

    // Set scoped cookie (valid for this subdomain only)
    setCookie(res, PROXY_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: !dev,
      sameSite: "lax",
      maxAge: 15 * 60, // 15 minutes
      path: "/",
    });

    proxyLogger.info(
      {
        userId: payload.userId,
        podSlug: payload.podSlug,
        targetPort: payload.targetPort,
      },
      "Set proxy cookie for user",
    );

    // Redirect to root (remove token from URL)
    res.writeHead(302, {
      Location: "/",
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
 * Get or create a cached proxy for a specific pod
 */
const getOrCreatePodProxy = async (
  payload: ProxyTokenPayload,
  // biome-ignore lint: Any is needed for proxy middleware compatibility
): Promise<any | null> => {
  // Create cache key from pod + target port
  const cacheKey = `${payload.podId}:${payload.targetPort}`;

  // Check if we have a valid cached proxy
  const cached = proxyCache.get(cacheKey);
  if (cached) {
    proxyLogger.debug(
      { podSlug: payload.podSlug, targetPort: payload.targetPort },
      "Using cached proxy",
    );
    return cached.proxy;
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
 * Create proxy middleware for a specific pod
 */
const createPodProxy = async (
  payload: ProxyTokenPayload,
): Promise<RequestHandler | null> => {
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

    // Create proxy middleware
    const proxy = createProxyMiddleware({
      target: `http://${targetHost}:${targetPort}`,
      changeOrigin: true,
      ws: true, // Enable WebSocket proxying

      // Modify headers
      headers: {
        Host: `localhost-${payload.targetPort}.pod-${payload.podSlug}.pinacle.dev`,
      },

      // logger: console,
    });

    // Return proxy with error handling (cast to any for type compatibility)
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
      const authUrl = `http://localhost:${port}/api/proxy-auth?pod=${encodeURIComponent(parsed.podSlug)}&port=${parsed.port}`;
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
      const authUrl = `http://localhost:${port}/api/proxy-auth?pod=${encodeURIComponent(parsed.podSlug)}&port=${parsed.port}`;
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

    // Proxy the request
    proxy(req, res, (err: Error | undefined) => {
      if (err) {
        proxyLogger.error({ err }, "Proxy middleware error");
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Proxy error" }));
        }
      }
    });
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
        await handle(req, res, parsedUrl);
      }
    } catch (err) {
      logger.error({ err }, "Server error");
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  });

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

        // Get or create cached proxy for this WebSocket connection
        const proxy = await getOrCreatePodProxy(payload);
        if (!proxy) {
          logger.error("WebSocket upgrade failed: Could not create proxy");
          socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
          socket.destroy();
          return;
        }

        // Upgrade the WebSocket connection through the proxy
        logger.debug(
          { podSlug: parsed.podSlug, port: parsed.port },
          "Upgrading WebSocket through proxy",
        );
        proxy.upgrade(req, socket, head);
      } else {
        // Not a proxy request - let Next.js handle it (if it supports WS)
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
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
