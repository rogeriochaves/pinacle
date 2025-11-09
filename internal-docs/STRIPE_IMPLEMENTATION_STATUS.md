# Stripe Billing Implementation Status

## Overview

This document tracks the implementation status of the comprehensive Stripe billing system for Pinacle. This is a **massive undertaking** that involves:
- 110 granular tasks across 12 major epics
- Database schema design
- Stripe integration
- Webhook handling
- Usage metering
- Subscription management
- Email notifications
- UI components
- Comprehensive testing

## Implementation Progress

### ✅ **COMPLETED** (33 tasks)

#### Epic 1: Environment & Infrastructure Setup
- ✅ Installed Stripe SDK (`stripe` and `@stripe/stripe-js`)
- ✅ Added environment variables (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PUBLISHABLE_KEY)
- ✅ Created Stripe client initialization (`src/lib/stripe.ts`)

#### Epic 2: Database Schema Design & Migration
- ✅ Designed `stripe_customers` table
- ✅ Designed `stripe_subscriptions` table
- ✅ Designed `stripe_prices` table
- ✅ Designed `usage_records` table with indexes
- ✅ Designed `stripe_events` table for idempotency
- ✅ Designed `invoices` table
- ✅ Generated Drizzle migration
- ✅ Applied migration to database
- ✅ Added all necessary indexes

#### Epic 3: Stripe Product & Price Setup Script
- ✅ Created `scripts/setup-stripe-products.ts`
- ✅ Implemented Stripe product creation for all resource tiers
- ✅ Implemented metered price creation (usage_type: metered)
- ✅ Added multi-currency support (USD, EUR, BRL)
- ✅ Save prices to database

#### Epic 4: Usage Tracking & Metering System
- ✅ Created `src/lib/billing/usage-tracker.ts`
- ✅ Implemented hourly pod runtime tracking
- ✅ Implemented usage aggregation
- ✅ Implemented Stripe usage reporting via API
- ✅ Implemented usage reconciliation/retry logic
- ✅ Updated worker.ts to track usage every hour

#### Epic 5: Subscription Lifecycle Management
- ✅ Created `src/lib/billing/subscription-service.ts`
- ✅ Implemented `activateSubscription()`
- ✅ Implemented `cancelSubscription()`
- ✅ Implemented `pauseSubscription()`
- ✅ Implemented `resumeSubscription()`
- ✅ Implemented `updateSubscription()`

#### Epic 6: Pod Suspension Logic
- ✅ Created `src/lib/billing/pod-suspension.ts`
- ✅ Implemented `suspendUserPods()`
- ✅ Implemented `deleteUserPods()`
- ✅ Added grace period tracking to database schema

#### Epic 7: Stripe Webhook Handler Implementation
- ✅ Created webhook endpoint (`/api/webhooks/stripe/route.ts`)
- ✅ Implemented webhook signature verification
- ✅ Implemented event logging to `stripe_events` table
- ✅ Implemented idempotency checks
- ✅ Handled all 7 subscription events
- ✅ Handled all 4 invoice events

#### Epic 8: Supporting Utilities
- ✅ Created `src/lib/billing/price-lookup.ts` with price/product ID lookup functions

---

## 🚧 **IN PROGRESS / REMAINING** (77 tasks)

### Epic 5: Subscription Creation & Checkout Flow (NOT STARTED)
Need to create:
1. tRPC billing router (`src/lib/trpc/routers/billing.ts`)
2. Checkout endpoints:
   - `billing.createCheckoutSession`
   - `billing.handleCheckoutSuccess`
   - `billing.getSubscriptionStatus`
3. Customer Portal endpoints:
   - `billing.createPortalSession`
   - `billing.getCurrentUsage`
4. Update `setup-form.tsx` to check subscription before pod creation
5. Handle checkout cancellation

### Epic 9: Customer Portal & Billing Management (NOT STARTED)
Need to create:
1. `app/dashboard/billing/page.tsx` - main billing page
2. Components to display:
   - Subscription status and tier
   - Usage summary with costs
   - Invoice history
   - "Manage Billing" button to Stripe portal

### Epic 10: Email Notification System (NOT STARTED)
Need to create email templates:
1. `src/emails/payment-success.tsx`
2. `src/emails/payment-failed.tsx`
3. `src/emails/subscription-cancelled.tsx`
4. `src/emails/grace-period-warning.tsx`
5. `src/emails/final-deletion-warning.tsx`

And email sending functions in `src/lib/email.ts`:
- `sendPaymentSuccessEmail()`
- `sendPaymentFailedEmail()`
- etc.

Then integrate into webhook handlers.

### Epic 11: Admin & Monitoring Tools (NOT STARTED)
Need to create:
1. `app/admin/billing/page.tsx` - admin billing dashboard
2. Display metrics: MRR, active subscriptions, churn
3. Payment success/failure rates
4. Usage metrics by tier
5. Webhook event viewer
6. Manual intervention tools

### Epic 12: Integration Testing (NOT STARTED - CRITICAL)
Need to write comprehensive tests for:
1. Checkout flow
2. All webhook event handlers
3. Payment failure -> grace period -> suspension flow
4. Usage tracking and reporting
5. Email delivery
6. Pod suspension/deletion
7. Idempotency
8. Multi-currency support

Use vitest and Stripe CLI (`stripe trigger`) for testing.

---

## Next Steps (Prioritized)

### IMMEDIATE (Required for MVP)

1. **Run the Stripe setup script**
   ```bash
   cd /Users/rchaves/Projects/pinacle
   pnpm add tsx -D # if not installed
   pnpm tsx scripts/setup-stripe-products.ts
   ```
   This will create products and prices in Stripe and save them to your database.

2. **Create the billing tRPC router**
   - Create `src/lib/trpc/routers/billing.ts`
   - Implement checkout session creation
   - Implement subscription status checks
   - Add to `src/lib/trpc/root.ts`

3. **Test the webhook handler**
   With `stripe listen` already running:
   ```bash
   stripe trigger customer.subscription.created
   stripe trigger invoice.payment_succeeded
   stripe trigger invoice.payment_failed
   ```
   Check logs to verify events are processed correctly.

4. **Create basic billing UI**
   - Create `app/dashboard/billing/page.tsx`
   - Display subscription status
   - Add "Manage Billing" button

5. **Integrate checkout into setup flow**
   - Modify `setup-form.tsx` to check subscription
   - Redirect to Stripe checkout if needed

### SHORT TERM (Within a week)

6. **Add email notifications**
   - Create email templates
   - Add send functions
   - Integrate into webhooks

7. **Create admin billing dashboard**
   - View all customers
   - View subscription metrics
   - Manual intervention tools

8. **Write integration tests**
   - Test webhook handling
   - Test checkout flow
   - Test usage tracking

### MEDIUM TERM (Nice to have)

9. **Grace period enforcement worker**
   - Daily job to check grace period expiration
   - Auto-delete pods after 7 days

10. **Enhanced monitoring**
    - Usage dashboards
    - Cost projections
    - Anomaly detection

---

## Testing Guide

### Test Webhook Events

You mentioned `stripe listen` is already running. To test:

```bash
# Test subscription events
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger customer.subscription.paused
stripe trigger customer.subscription.resumed

# Test invoice/payment events
stripe trigger invoice.created
stripe trigger invoice.finalized
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
```

Check your application logs and database to verify:
1. Events are logged to `stripe_events` table
2. Subscription records are created/updated
3. Pod suspension happens on payment failure
4. Invoices are saved

### Test Usage Tracking

1. Create a running pod
2. Wait for the worker to run (or trigger manually)
3. Check `usage_records` table for new records
4. Verify `reportedToStripe` is `true`
5. Check Stripe dashboard for usage records

### Test Checkout Flow (Once implemented)

1. Go through pod creation flow
2. Should be redirected to Stripe checkout
3. Use test card: `4242424242424242`
4. Complete checkout
5. Verify subscription is created
6. Verify you can create pods

---

## Database Schema Reference

### Key Tables

**stripe_customers**
- Maps users to Stripe customers
- Tracks subscription status
- Handles grace period

**stripe_subscriptions**
- Detailed subscription information
- Current period dates
- Cancellation status

**stripe_prices**
- Maps resource tiers to Stripe price IDs
- Supports multiple currencies

**usage_records**
- Local tracking of pod runtime
- Reports to Stripe for metered billing
- Retry mechanism for failed reports

**stripe_events**
- Webhook event log
- Idempotency tracking
- Error logging

**invoices**
- Cache of Stripe invoices
- Quick lookup for UI

---

## Configuration

### Environment Variables

Ensure these are set in `.env.local` (dev) and `.env` (prod):

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Stripe Dashboard Setup

1. Enable test mode
2. Set up webhook endpoint: `https://your-domain/api/webhooks/stripe`
3. Subscribe to events:
   - `customer.subscription.*`
   - `invoice.*`

---

## Architecture Decisions

### Why Metered Billing?

- Users pay for actual usage (hours)
- More flexible than fixed subscriptions
- Aligns with cloud resource model

### Why Multiple Currencies?

- Global user base
- Reduces currency conversion issues
- Better pricing control per region

### Why Local Usage Records?

- Backup if Stripe API fails
- Fast queries for usage dashboards
- Audit trail
- Reconciliation capability

### Why Stripe as Source of Truth?

- PCI compliance
- Reliable payment processing
- Built-in retry logic
- Customer portal for self-service

---

## Known Issues / TODOs

1. **Grace period enforcement worker not implemented**
   - Need daily job to check `gracePeriodStartedAt`
   - Auto-suspend/delete after 7 days

2. **Email notifications not integrated**
   - Webhooks process events but don't send emails yet

3. **No free tier logic**
   - Could add X free hours per month
   - Would need usage check before requiring payment

4. **No subscription tier changes**
   - Users can't upgrade/downgrade yet
   - Would need UI + logic to change subscription items

5. **No snapshot usage billing**
   - Only pod runtime is tracked
   - Snapshot storage billing TODO

---

## Files Created

```
/Users/rchaves/Projects/pinacle/
├── src/
│   ├── lib/
│   │   ├── stripe.ts (NEW)
│   │   ├── billing/
│   │   │   ├── price-lookup.ts (NEW)
│   │   │   ├── usage-tracker.ts (NEW)
│   │   │   ├── subscription-service.ts (NEW)
│   │   │   └── pod-suspension.ts (NEW)
│   │   └── db/
│   │       └── schema.ts (MODIFIED - added billing tables)
│   ├── app/
│   │   └── api/
│   │       └── webhooks/
│   │           └── stripe/
│   │               └── route.ts (NEW)
│   ├── worker.ts (MODIFIED - added usage tracking)
│   └── env.ts (MODIFIED - added Stripe env vars)
├── scripts/
│   └── setup-stripe-products.ts (NEW)
├── drizzle/
│   └── 0020_kind_shadowcat.sql (NEW - billing tables migration)
└── docs/
    └── STRIPE_IMPLEMENTATION_STATUS.md (THIS FILE)
```

---

## Summary

**Completed:** 33/110 tasks (~30%)

**Status:**
- ✅ Core infrastructure complete
- ✅ Database schema complete
- ✅ Webhook handling complete
- ✅ Usage tracking complete
- ✅ Subscription lifecycle management complete
- 🚧 Checkout flow - NOT STARTED
- 🚧 UI components - NOT STARTED
- 🚧 Email notifications - NOT STARTED
- 🚧 Admin tools - NOT STARTED
- 🚧 Testing - NOT STARTED (CRITICAL)

**Next Critical Steps:**
1. Run Stripe setup script
2. Create billing tRPC router
3. Test webhooks with Stripe CLI
4. Integrate checkout into setup flow
5. Write comprehensive tests

This is a solid foundation. The hardest parts (webhook handling, usage tracking, database design) are done. The remaining work is mostly tRPC endpoints, UI components, and testing.

