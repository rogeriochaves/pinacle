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

import { eq } from "drizzle-orm";
import type { IncomingMessage, ServerResponse } from "http";
import { createServer } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";
import next from "next";
import { parse } from "url";
import { db } from "./src/lib/db";
import { pods, servers } from "./src/lib/db/schema";
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

    console.log(
      `[ProxyServer] Set cookie for user ${payload.userId} → pod ${payload.podSlug}:${payload.targetPort}`,
    );

    // Redirect to root (remove token from URL)
    res.writeHead(302, {
      Location: "/",
      "Content-Type": "text/html",
    });
    res.end("<html><body>Redirecting...</body></html>");
    return true;
  } catch (error) {
    console.error("[ProxyServer] Callback error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
    return true;
  }
};

/**
 * Create proxy middleware for a specific pod
 */
const createPodProxy = async (
  payload: ProxyTokenPayload,
  // biome-ignore lint: Any is needed for proxy middleware compatibility
): Promise<any | null> => {
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
      console.error(
        `[ProxyServer] Pod ${payload.podId} not found or has no server`,
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
      console.error(`[ProxyServer] Server ${pod.serverId} not found`);
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
      console.error(
        `[ProxyServer] Nginx proxy port not found for pod ${payload.podId}`,
      );
      return null;
    }

    // Determine target host
    const isLimaVm = !!server.limaVmName;
    const targetHost = isLimaVm ? "127.0.0.1" : server.ipAddress;
    const targetPort = nginxProxy.external;

    console.log(
      `[ProxyServer] Creating proxy: ${targetHost}:${targetPort} → pod ${payload.podSlug}:${payload.targetPort}`,
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

      logger: console,
    });

    // Return proxy with error handling (cast to any for type compatibility)
    return proxy as any;
  } catch (error) {
    console.error("[ProxyServer] Error creating proxy:", error);
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
      res.end(`<html><body>Token expired, redirecting to authenticate...</body></html>`);
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

    // Create and use proxy
    const proxy = await createPodProxy(payload);
    if (!proxy) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Pod proxy unavailable" }));
      return;
    }

    // Proxy the request
    proxy(req, res, (err: Error | undefined) => {
      if (err) {
        console.error("[ProxyServer] Proxy middleware error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Proxy error" }));
        }
      }
    });
  } catch (error) {
    console.error("[ProxyServer] Handle proxy error:", error);
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
        console.log(`[Server] Detected proxy request: ${requestHostname}`);

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
      console.error("[Server] Error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  });

  server.listen(port, () => {
    console.log(`✅ Server ready on http://${hostname}:${port}`);
    console.log(`   - Next.js app: http://${hostname}:${port}`);
    console.log(`   - Proxy requests: http://localhost-*.pod-*.${hostname}:${port}`);
  });
};

// Start the servers
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
