# Application Proxy System

## Overview

The application proxy system provides authenticated, subdomain-based routing from the main Next.js application to pod services. This is the second layer of proxying in Pinacle's architecture.

**Implementation:** `src/app/api/proxy/route.ts`, `src/lib/proxy-utils.ts`

## Two-Layer Proxy Architecture

```
┌──────────────────────────────────────────────────────┐
│  Browser                                              │
│  localhost-8080-pod-myslug.pinacle.dev/api/proxy    │
└──────────────┬───────────────────────────────────────┘
               │ [1] Request with session cookie
               ▼
┌──────────────────────────────────────────────────────┐
│  Next.js Application Proxy (Layer 1)                 │
│  - Parse hostname (port + pod slug)                  │
│  - Authenticate via NextAuth session                 │
│  - Authorize user access to pod                      │
│  - Look up pod's server and external port            │
└──────────────┬───────────────────────────────────────┘
               │ [2] Forward with Host header
               ▼
┌──────────────────────────────────────────────────────┐
│  Pod's Nginx Proxy (Layer 2)                         │
│  - Parse Host header to extract target port          │
│  - Route to correct service via port                 │
└──────────────┬───────────────────────────────────────┘
               │ [3] Forward to service
               ▼
┌──────────────────────────────────────────────────────┐
│  Service (VS Code, Kanban, App, etc.)                │
│  - Running on specific port (e.g., 8726, 5262)       │
└──────────────────────────────────────────────────────┘
```

## URL Format

### Production
```
https://localhost-{PORT}-pod-{SLUG}.pinacle.dev/api/proxy
```

### Development
```
http://localhost-{PORT}-pod-{SLUG}.localhost:3000/api/proxy
```

### Examples
```
http://localhost-8726-pod-my-project.localhost:3000/api/proxy  → VS Code
http://localhost-5262-pod-my-project.localhost:3000/api/proxy  → Kanban
http://localhost-3000-pod-my-project.localhost:3000/api/proxy  → User app
http://localhost-2528-pod-my-project.localhost:3000/api/proxy  → Claude Code
```

## Request Flow

### 1. Hostname Parsing

The proxy extracts the target port and pod slug from the hostname:

```typescript
// Input: "localhost-8080-pod-myslug.pinacle.dev"
// Output: { port: 8080, podSlug: "myslug" }

const parsed = parseProxyHostname(hostname);
```

**Implementation:** `parseProxyHostname()` in `src/lib/proxy-utils.ts`

### 2. Authentication

The proxy authenticates the request using NextAuth session cookies:

```typescript
const session = await getServerSession(authOptions);
if (!session?.user?.id) {
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}
```

**Key:** Session cookies are shared across subdomains via cookie domain configuration.

### 3. Authorization

The proxy checks if the user has access to the pod:

```typescript
const accessCheck = await checkSessionPodAccess(session, podSlug);
if (!accessCheck.hasAccess) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}
```

**Authorization rules:**
- User is the pod owner
- User is a member of the team that owns the pod

**Implementation:** `checkPodAccess()` in `src/lib/proxy-utils.ts`

### 4. Pod Lookup

The proxy retrieves pod and server details from the database:

```typescript
const pod = accessCheck.pod;
const [server] = await db
  .select()
  .from(servers)
  .where(eq(servers.id, pod.serverId))
  .limit(1);
```

### 5. Port Resolution

The proxy extracts the Nginx proxy port from the pod's port configuration:

```typescript
const ports = JSON.parse(pod.ports);
const nginxProxy = ports.find((p) => p.name === "nginx-proxy");
const externalPort = nginxProxy.external; // e.g., 30001
```

### 6. Request Forwarding

The proxy forwards the request to the pod's server with the correct Host header:

```typescript
// Target URL: http://127.0.0.1:30001 (for Lima VMs)
//          or http://10.0.0.5:30001 (for remote servers)
const targetHost = server.limaVmName ? "127.0.0.1" : server.ipAddress;
const targetUrl = `http://${targetHost}:${externalPort}${pathname}`;

// Critical: Set Host header for hostname-based routing in pod's Nginx
forwardHeaders.set("Host", `localhost-${targetPort}.pod-${podSlug}.pinacle.dev`);

const response = await fetch(targetUrl, {
  method: req.method,
  headers: forwardHeaders,
  body: req.body,
});
```

### 7. Response Streaming

The proxy streams the response back to the client:

```typescript
return new NextResponse(response.body, {
  status: response.status,
  headers: responseHeaders,
});
```

## Authentication & Security

### Session Cookie Configuration

NextAuth is configured to share session cookies across all subdomains:

```typescript
// In src/lib/auth.ts
cookies: {
  sessionToken: {
    name: process.env.NODE_ENV === "production"
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token",
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // Share across all subdomains
      domain: process.env.NODE_ENV === "production"
        ? ".pinacle.dev"
        : ".localhost",
      secure: process.env.NODE_ENV === "production",
    },
  },
}
```

**Key points:**
- Production: cookies work on `pinacle.dev` and `*.pinacle.dev`
- Development: cookies work on `localhost` and `*.localhost`
- `httpOnly: true` prevents XSS attacks
- `sameSite: "lax"` prevents CSRF attacks

### Authorization Model

Access to a pod is granted if:
1. **User is the pod owner** - Direct ownership
2. **User is a team member** - Team-based access

**Implementation:**
```typescript
// Check owner
if (pod.ownerId === userId) {
  return { hasAccess: true, pod };
}

// Check team membership
const [membership] = await db
  .select()
  .from(teamMembers)
  .where(
    and(
      eq(teamMembers.teamId, pod.teamId),
      eq(teamMembers.userId, userId)
    )
  )
  .limit(1);

if (membership) {
  return { hasAccess: true, pod };
}
```

### Security Features

1. **Authentication required** - All requests must have valid session
2. **Authorization per pod** - Users can only access pods they own or are team members of
3. **Session-based security** - Leverages NextAuth's battle-tested session management
4. **Subdomain isolation** - Each pod slug is isolated by subdomain
5. **No token exposure** - Session cookies are httpOnly

## Pod's Internal Nginx Proxy

The second layer of proxying happens inside each pod container.

**Configuration:** Generated in `src/lib/pod-orchestration/container-runtime.ts`

### Nginx Configuration

```nginx
server {
    listen 80 default_server;
    server_name _;

    # Extract port from hostname
    set $target_port 3000;
    if ($host ~* ^localhost-(\d+)\..*$) {
        set $target_port $1;
    }

    location / {
        proxy_pass http://127.0.0.1:$target_port;
        proxy_set_header Host localhost:$target_port;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

### How Hostname Routing Works

1. **Application proxy sets Host header:** `localhost-8726.pod-myslug.pinacle.dev`
2. **Nginx extracts port from hostname:** `8726`
3. **Nginx proxies to that port:** `http://127.0.0.1:8726`
4. **Service receives request:** VS Code Server on port 8726

## Workbench Integration

The Workbench component uses the proxy to embed services in iframes:

```typescript
const getTabUrl = (tab: Tab): string => {
  const tabConfig = TABS.find((t) => t.id === tab);
  if (!tabConfig) return "";

  const isDevelopment = process.env.NODE_ENV === "development";
  const domain = isDevelopment
    ? "localhost:3000"
    : "pinacle.dev";

  return `http://localhost-${tabConfig.port}.pod-${pod.slug}.${domain}/api/proxy`;
};
```

**Tabs configuration:**
```typescript
const TABS = [
  { id: "vscode", label: "VS Code", port: 8726 },
  { id: "kanban", label: "Kanban", port: 5262 },
  { id: "claude", label: "Claude", port: 2528 },
  { id: "terminal", label: "Terminal", port: 7681 },
  { id: "browser", label: "Preview", port: 5173 },
];
```

## Development Setup

### DNS Configuration

For local development with subdomain-based routing:

1. **Add to `/etc/hosts`:**
   ```
   127.0.0.1 localhost
   127.0.0.1 localhost-8726-pod-test.localhost
   127.0.0.1 localhost-3000-pod-test.localhost
   # Add more as needed
   ```

2. **Or use wildcard DNS** (recommended):
   - Use a service like `*.localhost.direct` which resolves all subdomains to 127.0.0.1
   - Or set up local DNS server (dnsmasq) for `*.localhost`

### Testing

Run the proxy integration tests:

```bash
pnpm test proxy.test.ts
```

The test:
1. Provisions a pod with Nginx proxy
2. Starts a test HTTP server inside the pod
3. Makes a request through the proxy with correct Host header
4. Verifies the response is proxied correctly

## Limitations & Future Work

### Current Limitations

1. **WebSocket Support** - Next.js API routes don't support WebSocket upgrades natively
2. **Performance** - Two layers of proxying add latency (~10-30ms)
3. **DNS Setup** - Requires DNS configuration for development

### WebSocket Handling

WebSocket upgrades need to be handled at a different layer:

**Options:**
1. **Custom Next.js server** - Use custom server with WebSocket support
2. **Separate WebSocket proxy** - Dedicated WebSocket proxy service
3. **Infrastructure-level** - Handle at Nginx/load balancer level

**Current workaround:** Most services (VS Code, Terminal) handle WebSockets internally via HTTP upgrade, which works through the proxy as long as the connection is established.

### Future Improvements

1. **Connection pooling** - Reuse connections to pod servers
2. **Response caching** - Cache static assets from pods
3. **Request/response compression** - Reduce bandwidth
4. **Rate limiting** - Per-user and per-pod limits
5. **Request logging** - Detailed proxy request logs
6. **Metrics** - Track proxy performance and usage

## Error Handling

The proxy handles various error scenarios:

### Invalid Hostname
```json
{
  "error": "Invalid proxy hostname format: ...",
  "status": 400
}
```

### Not Authenticated
```json
{
  "error": "Not authenticated",
  "status": 401
}
```

### Unauthorized Access
```json
{
  "error": "User is not authorized to access this pod",
  "status": 403
}
```

### Pod Not Running
```json
{
  "error": "Pod is not running (status: stopped)",
  "status": 503
}
```

### Server Error
```json
{
  "error": "Internal proxy error",
  "details": "...",
  "status": 500
}
```

## Monitoring & Debugging

### Proxy Logs

The proxy logs are available in Next.js console output:

```bash
pnpm dev
```

### Test Proxy Manually

Test the proxy with curl:

```bash
# Get session cookie from browser DevTools
export SESSION_COOKIE="next-auth.session-token=..."

# Make authenticated request
curl -v \
  -H "Host: localhost-3000-pod-myslug.localhost" \
  -H "Cookie: $SESSION_COOKIE" \
  http://localhost:3000/api/proxy
```

### Debug Pod's Nginx

Check Nginx logs inside a pod:

```bash
docker exec <container-id> cat /tmp/nginx-access.log
docker exec <container-id> cat /tmp/nginx-error.log
```

## Related Documentation

- [04-networking.md](./04-networking.md) - Pod networking and Nginx configuration
- [13-pod-orchestration-implementation.md](./13-pod-orchestration-implementation.md) - Pod provisioning details
- `src/app/api/proxy/route.ts` - Proxy implementation
- `src/lib/proxy-utils.ts` - Proxy utilities
- `src/components/dashboard/workbench.tsx` - Workbench integration

