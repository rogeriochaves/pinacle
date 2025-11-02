# Screenshot Feature Implementation

## Overview
Implemented automatic screenshot capture for process tabs (custom URL tabs with address bar) in the workbench, with a "Jump Right Back" section on the landing page to help users quickly return to their running projects.

## Components Added

### 1. Database Schema
- **Table**: `pod_screenshot` (src/lib/db/schema.ts)
  - `id`: Screenshot ID
  - `podId`: Reference to pod
  - `url`: S3 URL of the screenshot
  - `port`: Port being viewed
  - `path`: Path being viewed
  - `sizeBytes`: Screenshot file size
  - `createdAt`: Timestamp

- **Migration**: `drizzle/0022_deep_karma.sql`

### 2. Screenshot Storage Service
- **File**: `src/lib/screenshots/screenshot-storage.ts`
- Uses the same S3 credentials as pod snapshots
- Stores screenshots in `screenshots/` folder (separate from snapshots)
- Returns public URLs for screenshots

### 3. API Endpoint
- **File**: `src/app/api/screenshots/route.ts`
- `POST /api/screenshots`
- Accepts: `{ podId, port, path, imageDataUrl }`
- Validates user access to pod
- Uploads to S3 and saves metadata to database

### 4. Screenshot Capture Hook
- **File**: `src/components/dashboard/use-screenshot.ts`
- `useScreenshot()`: Core hook for capturing and saving screenshots
- `useIframeScreenshot()`: Automatic hook for iframe components
- **Timing**:
  - First screenshot: 2 seconds after iframe loads
  - Subsequent screenshots: On tab activation if 5+ minutes have passed
  - Triggers: Tab switch, window focus

### 5. Screenshot Iframe Component
- **File**: `src/components/dashboard/screenshot-iframe.tsx`
- Wrapper around iframe that automatically captures screenshots
- Used for process tabs (custom URL tabs with address bars)

### 6. Workbench Integration
- **File**: `src/components/dashboard/workbench.tsx` (modified)
- Added `tabPaths` state to track current path per tab
- Updated AddressBar integration with `onPathChange` callback
- Process tabs now use `ScreenshotIframe` component

### 7. Address Bar Enhancement
- **File**: `src/components/dashboard/address-bar.tsx` (modified)
- Added `onPathChange` prop to notify parent of navigation
- Calls callback when iframe reports URL changes

### 8. tRPC Endpoint
- **File**: `src/lib/trpc/routers/pods.ts` (modified)
- `getRunningPodsWithScreenshots()`: Fetches running pods with their latest screenshot
- Returns max 6 pods, filtered to only those with screenshots
- Ordered by last started time

### 9. Landing Page Component
- **File**: `src/components/landing/jump-right-back.tsx`
- Shows "Jump Right Back" section with pod screenshots
- Only visible for signed-in users with running pods that have screenshots
- Grid layout with pod cards showing screenshot preview
- Click to open pod in workbench

### 10. Landing Page Integration
- **File**: `src/app/page.tsx` (modified)
- Added `JumpRightBack` component above `Templates`
- Automatically shows/hides based on user state

## Screenshot Capture Flow

1. **Initial Load**:
   - User opens a process tab (e.g., localhost:3000)
   - After 2 seconds, first screenshot is captured
   - Screenshot is uploaded to S3 and metadata saved

2. **Tab Switch**:
   - User switches to a different tab
   - After 5+ minutes, when they return to the tab
   - New screenshot is captured

3. **Window Focus**:
   - User switches to another app/browser window
   - After 5+ minutes, when they return to the app
   - New screenshot is captured (if the iframe is active)

## Screenshot Storage

- **Technology**: html2canvas (captures iframe content as PNG)
- **Quality**: 70% compression, 0.5x scale (half resolution)
- **Location**: S3 bucket (same as snapshots), `screenshots/` folder
- **Naming**: `{podId}-{timestamp}.png`

## Landing Page Behavior

- Shows up to 6 running pods with screenshots
- Only appears if user is signed in
- Only shows pods with at least one screenshot
- Click on any pod card to go directly to that pod's workbench

## Environment Variables

Uses existing S3 configuration:
- `SNAPSHOT_S3_ENDPOINT` (optional, for MinIO)
- `SNAPSHOT_S3_ACCESS_KEY`
- `SNAPSHOT_S3_SECRET_KEY`
- `SNAPSHOT_S3_BUCKET`
- `SNAPSHOT_S3_REGION`

## Dependencies Added

- `html2canvas@1.4.1`: For capturing iframe screenshots

## Testing

To test the feature:

1. Start a pod with a custom URL (e.g., a React/Next.js app)
2. Wait 2 seconds for initial screenshot
3. Navigate within the app, wait 5+ minutes, switch tabs - new screenshot should be captured
4. Visit the landing page while signed in - should see "Jump Right Back" section with pod screenshots
5. Click on a pod card - should navigate to that pod's workbench

## Notes

- Screenshots are only captured for "process tabs" (tabs with address bars, i.e., custom URL tabs)
- Service tabs (terminal, code editor, etc.) do not capture screenshots
- The 5-minute throttle prevents excessive screenshot captures
- Screenshots use the iframe's current URL (port + path) for accurate tracking
- The address bar's iframe navigation events are the source of truth for URL tracking

