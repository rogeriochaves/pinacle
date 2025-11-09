# Admin Area - Implementation Summary

## Overview

A comprehensive admin dashboard for monitoring and managing the Pinacle platform, accessible only to users with emails listed in the `ADMIN_EMAILS` environment variable.

## Features Implemented

### 1. Admin Authentication & Authorization

**Location**: `src/lib/trpc/routers/admin.ts`

- **Admin Middleware**: Custom tRPC procedure that checks if user's email is in `ADMIN_EMAILS`
- **Environment Variable**: `ADMIN_EMAILS` - comma-separated list of admin emails
- **Server-Side Protection**: Admin layout checks authorization before rendering

### 2. tRPC Admin Endpoints

**Router**: `src/lib/trpc/routers/admin.ts`

#### Server Management
- `getAllServers()` - List all servers with latest metrics and active pod counts
- `getServerById({ serverId })` - Get detailed server information
- `getServerMetricsHistory({ serverId, hoursAgo })` - Historical metrics (24h default, up to 7 days)
- `getPodsOnServer({ serverId })` - List all pods on a specific server with owner/team info

#### Pod Monitoring
- `getPodMetricsHistory({ podId, hoursAgo })` - Historical resource usage for individual pods
- `getPodDetails({ podId })` - Complete pod information with logs, metrics, owner, team, and server

#### User Management
- `getAllUsers({ search, limit, offset })` - Search users by name, email, or GitHub username
- `getUserDetails({ userId })` - Full user profile with teams, pods, and GitHub installations

#### Team Management
- `getTeamDetails({ teamId })` - Team information with owner, members, and associated pods

#### Platform Stats
- `getPlatformStats()` - Overview stats (users, teams, pods, servers)
- `isAdmin()` - Check if current user is admin

### 3. Admin Dashboard Pages

#### Main Dashboard (`/admin`)
**File**: `src/app/admin/page.tsx`

- Platform statistics cards (users, teams, pods, servers)
- Server grid with real-time metrics
- Auto-refreshes every 5 seconds
- Visual resource usage bars (CPU, memory, disk)
- Server status indicators

#### Server Detail Page (`/admin/servers/[id]`)
**File**: `src/app/admin/servers/[id]/page.tsx`

- Server hardware specifications
- Current resource usage with progress bars
- 4 historical metric charts (24h):
  - CPU Usage %
  - Memory Usage %
  - Disk Usage %
  - Active Pod Count
- Expandable pod list with:
  - Pod status and tier
  - Owner and team links
  - Latest resource usage
  - Historical metrics charts (6h) when expanded:
    - CPU, Memory, Disk usage
    - Network RX/TX

#### Users List Page (`/admin/users`)
**File**: `src/app/admin/users/page.tsx`

- Searchable user table (name, email, GitHub username)
- Real-time search with debouncing (300ms)
- Displays: GitHub connection, team count, pod count, join date
- Link to user details

#### User Detail Page (`/admin/users/[id]`)
**File**: `src/app/admin/users/[id]/page.tsx`

- Complete user profile information
- GitHub App installations list
- Teams membership with roles (clickable to team details)
- All pods owned by user with status, tier, and links (clickable to pod details)

#### Team Detail Page (`/admin/teams/[id]`)
**File**: `src/app/admin/teams/[id]/page.tsx`

- Team information (name, slug, description, creation date)
- Team owner details (clickable to user details)
- List of all team members with roles and join dates (clickable to user details)
- All pods associated with the team (clickable to pod details)

#### Pod Detail Page (`/admin/pods/[id]`)
**File**: `src/app/admin/pods/[id]/page.tsx`

- Complete pod information (ID, tier, container ID, resources, URLs)
- Links to owner (user), team, and server
- Current resource usage metrics
- 5 historical metric charts (24h):
  - CPU Usage %
  - Memory Usage MB
  - Disk Usage MB
  - Network RX MB
  - Network TX MB
- Complete provisioning logs from `pod_logs` table:
  - Timestamped entries
  - Command executed
  - Exit codes
  - Duration
  - stdout/stderr output
  - Formatted in terminal-style UI

### 4. Reusable Components

#### MetricsChart
**File**: `src/components/admin/metrics-chart.tsx`

- Built with Recharts
- Configurable color, unit, height, max value
- Responsive design
- Tooltips with formatted values
- Gradient area fills

#### ServerCard
**File**: `src/components/admin/server-card.tsx`

- Compact server overview
- Resource usage visualization
- Click to navigate to detail page
- Status badge (online/offline)
- Active pod count

#### PodRow
**File**: `src/components/admin/pod-row.tsx`

- Expandable pod list item (used in server detail page)
- Shows basic info collapsed
- Reveals 5 metrics charts when expanded
- Links to user and team (clickable)
- "View Details" button to navigate to pod detail page
- Auto-loads historical data on expand

### 5. Testing

**File**: `src/lib/trpc/routers/__tests__/admin.integration.test.ts`

Comprehensive integration tests covering:
- ✅ Admin authentication (isAdmin check)
- ✅ Authorization enforcement (FORBIDDEN errors for non-admins)
- ✅ Server listing with metrics
- ✅ Server detail queries
- ✅ Pod listing on servers
- ✅ User search and filtering
- ✅ User details with relationships
- ✅ Platform statistics

## Usage

### Setup

1. Add admin emails to `.env.local`:
```bash
ADMIN_EMAILS=admin@example.com,other-admin@example.com
```

2. Sign in with an admin email

3. Navigate to `/admin`

### Routes

- `/admin` - Main dashboard with server overview
- `/admin/servers/[id]` - Server details with graphs and pod list
- `/admin/users` - User search and management
- `/admin/users/[id]` - User profile with full details
- `/admin/teams/[id]` - Team details with members and pods
- `/admin/pods/[id]` - Pod details with logs and metrics

### Features in Action

#### Real-Time Monitoring
- All pages auto-refresh every 5 seconds
- Visual indicators show refresh status
- No page reload required

#### Historical Data
- Server metrics: 24 hours by default (configurable up to 7 days)
- Pod metrics: 6 hours for quick overview
- Interactive charts with hover tooltips

#### Search & Filter
- Users can be searched by name, email, or GitHub username
- Search is debounced for performance
- Results update in real-time

#### Navigation & Drill-Down
- Click on servers to see detailed metrics and pods
- Click on users to see their profile, teams, and pods
- Click on teams to see members and associated pods
- Click on pods to see logs, metrics, owner, team, and server
- Comprehensive cross-linking between all entities
- "View Details" buttons in expandable sections

## Security

- **Server-Side**: Layout checks admin status before rendering
- **API-Level**: All admin endpoints protected by middleware
- **Email-Based**: Simple comma-separated list for easy management
- **No Database Changes**: Authorization lives in environment variable

## Future Enhancements

Potential additions for the admin area:
- [ ] Export data (CSV, JSON)
- [ ] User impersonation for support
- [ ] Bulk actions (restart pods, etc.)
- [ ] Alert configuration
- [ ] Audit logs
- [ ] Custom date range for charts
- [ ] Real-time WebSocket updates
- [ ] Pod action buttons (restart, stop, delete)
- [ ] Server management (add, remove, maintenance mode)

## Dependencies Added

- `recharts` (v3.2.1) - For metrics visualization

## Files Created/Modified

### Created
- `src/lib/trpc/routers/admin.ts` - Admin API router
- `src/app/admin/layout.tsx` - Admin area layout with auth
- `src/app/admin/page.tsx` - Main dashboard
- `src/app/admin/servers/[id]/page.tsx` - Server detail page
- `src/app/admin/users/page.tsx` - Users list
- `src/app/admin/users/[id]/page.tsx` - User detail page
- `src/app/admin/teams/[id]/page.tsx` - Team detail page
- `src/app/admin/pods/[id]/page.tsx` - Pod detail page with logs
- `src/components/admin/server-card.tsx` - Server card component
- `src/components/admin/metrics-chart.tsx` - Metrics chart component
- `src/components/admin/pod-row.tsx` - Expandable pod row component
- `src/lib/trpc/routers/__tests__/admin.integration.test.ts` - Integration tests

### Modified
- `src/env.ts` - Added `ADMIN_EMAILS` environment variable
- `src/lib/trpc/root.ts` - Added admin router to app router
- `src/lib/trpc/client.ts` - Exported `RouterOutputs` type
- `src/lib/trpc/server.ts` - Added `createInnerTRPCContext` for testing
- `package.json` - Added recharts dependency

## Testing

Run the admin integration tests:
```bash
pnpm test src/lib/trpc/routers/__tests__/admin.integration.test.ts
```

All tests verify:
- Admin authorization works correctly
- Non-admin users are blocked
- Data is returned with proper relationships
- Search and filtering work as expected

