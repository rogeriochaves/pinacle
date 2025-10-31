# Stripe Billing Testing Guide

This guide covers comprehensive testing of the Stripe billing integration using Stripe CLI and manual flows.

## Prerequisites

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local dev server
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## Test Environment Setup

1. **Start the development server:**
```bash
pnpm dev
```

2. **Start the background worker:**
```bash
pnpm tsx src/worker.ts
```

3. **Start Stripe webhook forwarding:**
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

4. **Set environment variables:**
```bash
# .env.local
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  # From stripe listen output
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## Testing Webhook Events with Stripe CLI

### 1. Test Subscription Created

```bash
stripe trigger customer.subscription.created
```

**Expected:**
- Webhook received and processed
- New record in `stripe_subscriptions` table
- Customer status updated to "active"
- Event logged in `stripe_events` table

**Verify:**
```sql
SELECT * FROM stripe_subscriptions ORDER BY created_at DESC LIMIT 1;
SELECT * FROM stripe_events WHERE event_type = 'customer.subscription.created' ORDER BY created_at DESC LIMIT 1;
```

### 2. Test Payment Success

```bash
stripe trigger invoice.payment_succeeded
```

**Expected:**
- Invoice status updated to "paid"
- Grace period cleared (if any)
- Payment success email sent
- Customer status remains "active"

**Verify:**
```sql
SELECT * FROM invoices WHERE status = 'paid' ORDER BY created_at DESC LIMIT 1;
SELECT * FROM stripe_customers WHERE grace_period_started_at IS NULL;
```

### 3. Test Payment Failed

```bash
stripe trigger invoice.payment_failed
```

**Expected:**
- Invoice status updated to "uncollectible"
- Grace period started (7 days)
- Payment failed email sent
- Customer status changed to "past_due"

**Verify:**
```sql
SELECT * FROM stripe_customers WHERE grace_period_started_at IS NOT NULL;
SELECT * FROM invoices WHERE status = 'uncollectible' ORDER BY created_at DESC LIMIT 1;
```

### 4. Test Subscription Cancelled

```bash
stripe trigger customer.subscription.deleted
```

**Expected:**
- Subscription marked as cancelled
- All user pods suspended
- Subscription cancelled email sent
- Customer status updated to "canceled"

**Verify:**
```sql
SELECT * FROM pods WHERE owner_id = (
  SELECT user_id FROM stripe_customers WHERE status = 'canceled' LIMIT 1
);
-- All pods should be stopped
```

### 5. Test Subscription Paused

```bash
stripe trigger customer.subscription.paused
```

**Expected:**
- Subscription paused
- Pods suspended
- Customer status updated

### 6. Test Subscription Resumed

```bash
stripe trigger customer.subscription.resumed
```

**Expected:**
- Subscription active again
- Pods can be restarted
- Customer status updated

### 7. Test Invoice Finalized

```bash
stripe trigger invoice.finalized
```

**Expected:**
- Invoice saved to database
- Invoice details populated (amount, period, URLs)

### 8. Test Pending Update Applied

```bash
stripe trigger customer.subscription.pending_update_applied
```

**Expected:**
- Subscription updated with new details
- Tier changes reflected (if applicable)

## Manual E2E Testing Flow

### Complete User Journey Test

1. **Sign Up**
   ```
   - Create new account at /auth/signup
   - Verify welcome email sent
   - Check users table
   ```

2. **Check Subscription Status**
   ```
   - Go to /dashboard
   - Should not have subscription yet
   - Verify getSubscriptionStatus returns hasSubscription: false
   ```

3. **Create Checkout Session**
   ```
   - Go to /setup
   - Select dev.medium tier
   - Click "Create Pod"
   - Should redirect to Stripe checkout
   ```

4. **Complete Checkout**
   ```
   - Use test card: 4242 4242 4242 4242
   - Exp: Any future date
   - CVC: Any 3 digits
   - Complete checkout
   - Should redirect back to /dashboard?checkout=success
   ```

5. **Verify Subscription Created**
   ```sql
   SELECT * FROM stripe_customers WHERE user_id = '<your-user-id>';
   SELECT * FROM stripe_subscriptions WHERE user_id = '<your-user-id>';
   ```

6. **Create a Pod**
   ```
   - Go to /setup
   - Select configuration
   - Click "Create Pod"
   - Should succeed now
   ```

7. **Verify Usage Tracking**
   ```
   - Wait for hourly job (or trigger manually in code)
   - Check usage_records table
   - Verify Stripe meter events created
   ```

8. **Test Billing Dashboard**
   ```
   - Go to /dashboard/billing
   - Should show:
     * Current subscription status
     * Usage summary
     * Estimated cost
     * Recent invoices
   ```

9. **Test Customer Portal**
   ```
   - Click "Manage Billing"
   - Should redirect to Stripe portal
   - Can update payment method
   - Can view invoices
   ```

## Testing Multi-Currency

### Test USD
```bash
# Create checkout with USD
# Complete flow
# Verify price in dollars
```

### Test EUR
```bash
# Update user currency preference to EUR
# Create checkout
# Complete flow
# Verify price in euros (€5 for dev.small)
```

### Test BRL
```bash
# Update user currency preference to BRL
# Create checkout
# Complete flow
# Verify price in reais (R$30 for dev.small)
```

## Testing Grace Period Flow

### Simulate Payment Failure to Pod Deletion

1. **Trigger payment failure:**
   ```bash
   stripe trigger invoice.payment_failed
   ```

2. **Verify grace period started:**
   ```sql
   SELECT user_id, grace_period_started_at, status
   FROM stripe_customers
   WHERE grace_period_started_at IS NOT NULL;
   ```

3. **Wait for warning emails (or mock time):**
   - Day 4: 3 days remaining warning
   - Day 6: 1 day remaining warning

4. **After 7 days - pods suspended:**
   ```sql
   SELECT * FROM stripe_customers WHERE status = 'suspended';
   SELECT * FROM pods WHERE status = 'stopped';
   ```

5. **Deletion warnings:**
   - Day 14: 7 days until deletion
   - Day 21: Data deletion in 7 days

6. **After 28 days - data deleted:**
   ```sql
   SELECT * FROM stripe_customers WHERE status = 'deleted';
   -- All pods and snapshots should be deleted
   ```

## Testing Idempotency

### Test Duplicate Events

```bash
# Send same event twice
stripe events resend evt_xxxxx
```

**Expected:**
- First event processed
- Second event skipped (already in stripe_events table)
- Log message: "Event already processed, skipping"

**Verify:**
```sql
SELECT * FROM stripe_events WHERE stripe_event_id = 'evt_xxxxx';
-- Should have processed = true, only one record
```

## Testing Usage Tracking

### Test Hourly Metering

1. **Create a running pod**
2. **Wait for hourly job (or run manually):**
   ```bash
   # In code or trigger worker
   await usageTracker.trackPodRuntime();
   ```

3. **Verify usage recorded:**
   ```sql
   SELECT * FROM usage_records
   WHERE pod_id = '<pod-id>'
   ORDER BY created_at DESC;
   ```

4. **Verify reported to Stripe:**
   ```sql
   SELECT * FROM usage_records
   WHERE reported_to_stripe = true
   ORDER BY created_at DESC;
   ```

5. **Check Stripe dashboard:**
   - Go to Stripe dashboard
   - Navigate to Billing > Meters
   - Verify events are showing up

### Test Initial Hour Billing

1. **Create a new pod**
2. **Immediately check usage_records:**
   ```sql
   SELECT * FROM usage_records
   WHERE pod_id = '<new-pod-id>';
   ```
   - Should have 1 hour already recorded

3. **Delete pod within 5 minutes**
4. **Verify still charged for 1 hour**

## Testing Email Delivery

### Check Email Logs

```bash
# If using Resend, check logs at:
# https://resend.com/emails

# Or check console output for email sending logs
```

### Test Each Email Type

1. **Payment Success:**
   ```bash
   stripe trigger invoice.payment_succeeded
   # Check for email with subject "Payment Received"
   ```

2. **Payment Failed:**
   ```bash
   stripe trigger invoice.payment_failed
   # Check for email with subject "Payment Failed - Action Required"
   ```

3. **Subscription Cancelled:**
   ```bash
   stripe trigger customer.subscription.deleted
   # Check for email with subject "Subscription Cancelled"
   ```

4. **Grace Period Warning:**
   ```bash
   # Manually trigger grace period enforcement
   # Or mock time to day 4 or 6
   ```

5. **Final Deletion Warning:**
   ```bash
   # Mock time to day 14 or 21 after suspension
   ```

## Common Issues & Debugging

### Webhook not receiving events
```bash
# Check stripe listen is running
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Check webhook secret matches
echo $STRIPE_WEBHOOK_SECRET

# Check server is running on correct port
curl http://localhost:3000/api/webhooks/stripe
```

### Events not processing
```sql
-- Check for errors in stripe_events table
SELECT * FROM stripe_events
WHERE processing_error IS NOT NULL
ORDER BY created_at DESC;

-- Check event status
SELECT event_type, processed, processing_error
FROM stripe_events
ORDER BY created_at DESC
LIMIT 10;
```

### Usage not reported to Stripe
```sql
-- Check unreported usage
SELECT * FROM usage_records
WHERE reported_to_stripe = false
ORDER BY created_at DESC;

-- Manually retry
# In code:
await usageTracker.retryUnreportedUsage();
```

### Grace period not enforcing
```bash
# Check worker is running
ps aux | grep worker

# Check logs
tail -f /path/to/worker.log

# Manually trigger
# In code:
await gracePeriodEnforcer.enforceGracePeriod();
```

## Automated Test Commands

### Run integration tests
```bash
# Will be implemented
pnpm test:integration
```

### Run specific webhook test
```bash
# Will be implemented
pnpm test src/app/api/webhooks/stripe/__tests__/payment-succeeded.test.ts
```

## Production Testing Checklist

Before going live, test:

- [ ] Checkout flow with real cards (use Stripe test mode)
- [ ] Subscription creation and activation
- [ ] Usage tracking for all tier types
- [ ] Meter events appearing in Stripe
- [ ] All webhook events processing correctly
- [ ] Idempotency (send events twice)
- [ ] Payment success flow
- [ ] Payment failure flow
- [ ] Grace period enforcement (mock time)
- [ ] Pod suspension after grace period
- [ ] Pod deletion after extended suspension
- [ ] All email templates render correctly
- [ ] All emails sent at correct times
- [ ] Multi-currency pricing (USD, EUR, BRL)
- [ ] Billing dashboard displays correct data
- [ ] Customer portal access
- [ ] Invoice generation and download

## Useful Stripe CLI Commands

```bash
# List recent events
stripe events list --limit 10

# Resend an event
stripe events resend evt_xxxxx

# View event details
stripe events retrieve evt_xxxxx

# List customers
stripe customers list --limit 5

# View customer details
stripe customers retrieve cus_xxxxx

# List subscriptions
stripe subscriptions list --limit 5

# View meter events
stripe billing meters events list meter_xxxxx

# View logs
stripe logs tail
```

## Next Steps

1. Run through complete manual E2E test
2. Test each webhook event type with `stripe trigger`
3. Test grace period flow (may need to mock time)
4. Test multi-currency checkout
5. Verify all emails being sent
6. Test idempotency
7. Monitor Stripe dashboard for meter events
8. Review any errors in `stripe_events` table

