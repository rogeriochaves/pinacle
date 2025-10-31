#!/bin/bash

# Manual Stripe Webhook Testing
# This script triggers Stripe webhook events for manual testing
# Make sure you have: stripe listen --forward-to localhost:3000/api/webhooks/stripe

set -e

echo "🧪 Manual Stripe Webhook Testing"
echo "=================================="
echo ""
echo "⚠️  Prerequisites:"
echo "   1. Server running: pnpm dev (port 3000)"
echo "   2. Stripe listener: stripe listen --forward-to localhost:3000/api/webhooks/stripe"
echo ""
read -p "Press Enter when ready to start testing..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_event() {
    local event_name=$1
    local description=$2

    echo -e "${BLUE}🔔 Triggering: ${event_name}${NC}"
    echo "   ${description}"

    if stripe trigger "$event_name" 2>&1 | grep -q "Ready!"; then
        echo -e "${GREEN}   ✓ Event triggered successfully${NC}"
    else
        echo -e "${YELLOW}   ⚠ Event triggered (check logs)${NC}"
    fi
    echo ""
    sleep 2
}

echo "=================================="
echo "Testing Subscription Events"
echo "=================================="
echo ""

test_event "customer.subscription.created" "Should create subscription record and activate customer"
test_event "customer.subscription.updated" "Should update subscription details"
test_event "customer.subscription.deleted" "Should cancel subscription and suspend pods"

echo "=================================="
echo "Testing Invoice Events"
echo "=================================="
echo ""

test_event "invoice.created" "Should log invoice creation"
test_event "invoice.finalized" "Should save invoice to database"
test_event "invoice.payment_succeeded" "Should clear grace period and send success email"
test_event "invoice.payment_failed" "Should start grace period and send warning email"

echo "=================================="
echo "Testing Additional Events"
echo "=================================="
echo ""

test_event "customer.subscription.paused" "Should pause subscription and suspend pods"

echo ""
echo "=================================="
echo -e "${GREEN}✅ All events triggered!${NC}"
echo "=================================="
echo ""
echo "📊 Next steps:"
echo "   1. Check server logs for webhook processing"
echo "   2. Check database for created/updated records:"
echo "      - stripe_events table"
echo "      - stripe_subscriptions table"
echo "      - stripe_customers table"
echo "      - invoices table"
echo "   3. Verify emails were sent (check Resend logs)"
echo ""
echo "To query the database:"
echo "  pnpm run tasks"
echo "  > Check recent stripe_events"
echo ""

