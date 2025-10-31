-- Verify Stripe Webhook Processing Results
-- Run this after triggering webhook events

-- Recent webhook events received
SELECT
    stripe_event_id,
    event_type,
    processed,
    error,
    created_at
FROM stripe_event
ORDER BY created_at DESC
LIMIT 10;

-- Active subscriptions
SELECT
    sc.stripe_customer_id,
    ss.stripe_subscription_id,
    ss.status,
    ss.current_period_start,
    ss.current_period_end,
    sc.grace_period_started_at,
    u.email
FROM stripe_customer sc
JOIN stripe_subscription ss ON sc.stripe_subscription_id = ss.stripe_subscription_id
JOIN "user" u ON sc.user_id = u.id
ORDER BY ss.created_at DESC
LIMIT 5;

-- Recent invoices
SELECT
    i.stripe_invoice_id,
    i.status,
    i.amount_due / 100.0 as amount_due_dollars,
    i.amount_paid / 100.0 as amount_paid_dollars,
    i.currency,
    u.email,
    i.created_at
FROM invoice i
JOIN "user" u ON i.user_id = u.id
ORDER BY i.created_at DESC
LIMIT 5;

-- Usage records (recent)
SELECT
    ur.pod_id,
    ur.tier_id,
    ur.quantity as hours,
    ur.reported_to_stripe,
    ur.stripe_usage_record_id,
    ur.period_start,
    ur.period_end,
    u.email
FROM usage_record ur
JOIN "user" u ON ur.user_id = u.id
ORDER BY ur.created_at DESC
LIMIT 5;

