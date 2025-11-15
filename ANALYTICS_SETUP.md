# Analytics & Error Tracking Setup

This document describes the analytics and error tracking setup for Pinacle.

## Google Analytics (GA4)

### Setup
- **Measurement ID**: `G-C5MMEHWLNZ`
- **Implementation**: `src/components/analytics/google-analytics.tsx`
- **Utilities**: `src/lib/analytics/gtag.ts`

### Events Tracked
1. **`begin_checkout`** - When users initiate pod creation and are redirected to Stripe
   - Includes: currency, tier price, tier details

2. **`purchase`** - When users successfully complete Stripe payment
   - Includes: transaction ID, currency, tier price, tier details

## PostHog

### Client-Side Setup
- **Implementation**: `instrumentation-client.ts`
- **Host**: EU instance (`https://eu.i.posthog.com`)
- **Features Enabled**:
  - Exception capture
  - Debug mode in development
  - User identification (`person_profiles: "identified_only"`)
- **User Identification**: `src/components/analytics/posthog-identifier.tsx`
  - Automatically identifies users when they log in via NextAuth
  - Links all events and errors to user profiles
  - Resets on logout

### Server-Side Setup
- **Implementation**: `src/lib/posthog-server.ts` and `instrumentation.ts`
- **Error Boundaries**:
  - `src/app/global-error.tsx` - Catches global unhandled errors
  - `src/app/error.tsx` - Catches component-level errors

### Events Tracked
1. **`begin_checkout`** - Same as GA4
2. **`purchase`** - Same as GA4
3. **Exceptions** - All client and server-side errors automatically captured

### Sourcemap Upload
- **Package**: `@posthog/nextjs-config`
- **Configuration**: `next.config.ts`
- **Enabled**: Production builds only (when env vars are set)
- **Project Name**: `pinacle`

## Environment Variables

### Required for Basic Tracking
```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_your-posthog-project-key
```

### Optional for Sourcemap Upload
```bash
POSTHOG_PERSONAL_API_KEY=phx_your-personal-api-key
POSTHOG_ENV_ID=101659  # Your PostHog project ID
```

### How to Get These Values

#### NEXT_PUBLIC_POSTHOG_KEY
1. Go to PostHog → Settings → Project
2. Copy "Project API Key"

#### POSTHOG_PERSONAL_API_KEY (for sourcemaps)
1. Go to PostHog → Settings → Personal API Keys
2. Create a new key with "Project Admin" permissions
3. Copy the key (starts with `phx_`)

#### POSTHOG_ENV_ID (for sourcemaps)
1. Go to PostHog → Settings → Project
2. Copy "Project ID" (usually a number like `101659`)

## Manual Tracking

### Error Capture

For custom error handling, you can manually capture errors:

```typescript
import { captureException } from "@/lib/analytics/posthog";

try {
  // Your code
} catch (error) {
  captureException(error as Error, {
    context: "payment-processing",
    tier: "premium"
  });
}
```

### User Identification

User identification happens automatically via `PostHogIdentifier` component when users log in. But if you need to identify users manually:

```typescript
import { identifyUser, resetUser } from "@/lib/analytics/posthog";

// Identify a user
identifyUser("user_123", {
  email: "user@example.com",
  name: "John Doe",
  plan: "premium"
});

// On logout
resetUser();
```

### Group/Team Tracking

Track users by team/organization:

```typescript
import { identifyGroup } from "@/lib/analytics/posthog";

identifyGroup("team", teamId, {
  name: "Acme Corp",
  plan: "enterprise",
  seats: 50
});
```

## Testing

### Test GA4 Tracking
1. Open browser DevTools → Network tab
2. Filter for "google-analytics.com"
3. Create a pod and go through checkout
4. Verify `begin_checkout` and `purchase` events are sent

### Test PostHog Tracking
1. Open browser DevTools → Network tab
2. Filter for "ingest"
3. Create a pod and go through checkout
4. Verify events appear in PostHog → Activity

### Test Error Capture
1. Throw an error in a component
2. Check PostHog → Error Tracking to see if it's captured
3. Verify stack trace shows correct file and line numbers (with sourcemaps)

## Analytics Dashboard Access

- **Google Analytics**: [analytics.google.com](https://analytics.google.com)
- **PostHog**: [eu.posthog.com](https://eu.posthog.com)

