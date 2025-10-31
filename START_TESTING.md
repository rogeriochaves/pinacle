# 🧪 START HERE - Stripe Billing Testing

## Quick Start - Test in 5 Minutes

### 1. Start Your Environment

```bash
# Terminal 1 - Start dev server
pnpm dev

# Terminal 2 - Start worker (for usage tracking & grace period)
pnpm tsx src/worker.ts

# Terminal 3 - Forward Stripe webhooks
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### 2. Run Automated Webhook Tests

```bash
# Test all webhook events automatically
./scripts/test-stripe-webhooks.sh
```

This will trigger all 9 webhook events and you should see them being processed in your server logs.

### 3. Check Results

**In your database:**
```sql
-- All events should be logged
SELECT event_type, processed, created_at
FROM stripe_events
ORDER BY created_at DESC
LIMIT 10;

-- Check for any errors
SELECT * FROM stripe_events
WHERE processing_error IS NOT NULL;
```

**In your server logs:**
- Look for `[Webhook]` messages
- Should see "✓ Event processed successfully"
- No errors

## Priority Tests (Do These First)

### Test 1: Payment Success Flow ⭐️
```bash
stripe trigger invoice.payment_succeeded
```
**Expected:** Invoice marked paid, grace period cleared, email sent

### Test 2: Payment Failed Flow ⭐️⭐️⭐️
```bash
stripe trigger invoice.payment_failed
```
**Expected:**
- Grace period starts (7 days)
- Payment failed email sent
- Customer status = "past_due"

**Check:**
```sql
SELECT user_id, status, grace_period_started_at
FROM stripe_customers
WHERE grace_period_started_at IS NOT NULL;
```

### Test 3: Subscription Cancelled ⭐️⭐️
```bash
stripe trigger customer.subscription.deleted
```
**Expected:**
- All user pods suspended
- Cancellation email sent
- Customer status = "canceled"

### Test 4: Idempotency ⭐️
```bash
# Send same event twice
stripe trigger customer.subscription.created
stripe trigger customer.subscription.created
```
**Expected:** Second event skipped, logs show "already processed"

## Full Test Checklist

### Core Webhook Events
- [ ] `customer.subscription.created`
- [ ] `customer.subscription.updated`
- [ ] `customer.subscription.deleted`
- [ ] `customer.subscription.paused`
- [ ] `customer.subscription.resumed`
- [ ] `invoice.created`
- [ ] `invoice.finalized`
- [ ] `invoice.payment_succeeded`
- [ ] `invoice.payment_failed`

### System Functionality
- [ ] Events logged in `stripe_events` table
- [ ] No duplicate processing (idempotency works)
- [ ] Emails sent for payment events
- [ ] Pods suspended when subscription cancelled
- [ ] Grace period tracking works
- [ ] Worker processes running (usage tracking, grace period enforcement)

### Database Verification
```sql
-- Check event processing
SELECT
  event_type,
  COUNT(*) as count,
  SUM(CASE WHEN processed THEN 1 ELSE 0 END) as processed_count,
  SUM(CASE WHEN processing_error IS NOT NULL THEN 1 ELSE 0 END) as error_count
FROM stripe_events
GROUP BY event_type;

-- Check customers
SELECT user_id, status, grace_period_started_at, created_at
FROM stripe_customers
ORDER BY created_at DESC;

-- Check invoices
SELECT stripe_invoice_id, status, amount_due/100.0 as amount, created_at
FROM invoices
ORDER BY created_at DESC;

-- Check usage tracking
SELECT pod_id, tier_id, quantity, reported_to_stripe, created_at
FROM usage_records
ORDER BY created_at DESC
LIMIT 10;
```

## Common Issues & Fixes

### ❌ Webhooks not arriving
**Solution:**
```bash
# Make sure stripe listen is running
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Check STRIPE_WEBHOOK_SECRET in .env.local matches output
```

### ❌ Events showing errors in database
**Check:**
```sql
SELECT stripe_event_id, event_type, processing_error
FROM stripe_events
WHERE processing_error IS NOT NULL
ORDER BY created_at DESC;
```

**Common fixes:**
- Missing environment variables
- Database connection issues
- Email service not configured (will warn but not fail)

### ❌ Worker not running
```bash
# Start the worker
pnpm tsx src/worker.ts

# Should see:
# 🚀 Background worker started
# 📋 Scheduled tasks:
#   - Metrics cleanup: every hour
#   - Pod usage tracking: every hour
#   - Usage retry: every 6 hours
#   - Grace period enforcement: every 6 hours
```

## Next: Manual E2E Test

Once webhooks are working, test the full user flow:

1. **Create account** → Should get welcome email
2. **Try to create pod without subscription** → Should be blocked/redirected
3. **Go through Stripe checkout** → Use test card `4242 4242 4242 4242`
4. **Complete payment** → Subscription webhook fires
5. **Create a pod** → Should work now
6. **Wait for usage tracking** → Check `usage_records` table
7. **Check Stripe dashboard** → Meter events should appear

## Advanced Testing

See **STRIPE_TESTING_GUIDE.md** for:
- Multi-currency testing (USD, EUR, BRL)
- Grace period enforcement testing
- Email template testing
- Usage tracking verification
- Stripe meter event debugging

## Quick Commands

```bash
# View recent Stripe events
stripe events list --limit 10

# Resend a specific event
stripe events resend evt_xxxxx

# View Stripe logs
stripe logs tail

# Check database
psql $DATABASE_URL
```

## Success Criteria

✅ All 9 webhook events process without errors
✅ Events logged in `stripe_events` table
✅ Idempotency working (duplicate events skipped)
✅ Emails sent (check logs or Resend dashboard)
✅ Grace period logic working
✅ Worker running and processing scheduled tasks
✅ Usage tracking creating records

## Get Help

If something isn't working:
1. Check server logs for error messages
2. Check `stripe_events` table for `processing_error`
3. Verify environment variables are set
4. Ensure database migrations are applied
5. Check that worker is running

---

**Ready to start?** Run this:

```bash
# Terminal 1
pnpm dev

# Terminal 2
pnpm tsx src/worker.ts

# Terminal 3
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Terminal 4
./scripts/test-stripe-webhooks.sh
```

Good luck! 🚀

