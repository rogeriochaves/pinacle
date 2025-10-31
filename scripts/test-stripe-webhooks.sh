#!/bin/bash

# Stripe Webhook Testing Script
# Run this to test all webhook events with Stripe CLI

set -e

echo "🧪 Stripe Webhook Testing Script"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo "❌ Stripe CLI not installed. Install with: brew install stripe/stripe-cli/stripe"
    exit 1
fi

echo "✅ Stripe CLI found"
echo ""

# Check if user is logged in
if ! stripe config --list &> /dev/null; then
    echo "⚠️  Not logged into Stripe. Running: stripe login"
    stripe login
fi

echo "✅ Logged into Stripe"
echo ""

# Function to test an event
test_event() {
    local event_name=$1
    local description=$2

    echo -e "${BLUE}Testing: ${event_name}${NC}"
    echo "   → ${description}"

    stripe trigger $event_name

    echo -e "${GREEN}✓ Triggered${NC}"
    echo ""
    sleep 2
}

echo "Starting webhook tests..."
echo "Make sure you have stripe listen running in another terminal:"
echo "  stripe listen --forward-to localhost:3000/api/webhooks/stripe"
echo ""
read -p "Press Enter to continue..."
echo ""

# Test subscription events
echo -e "${YELLOW}=== SUBSCRIPTION EVENTS ===${NC}"
echo ""

test_event "customer.subscription.created" "New subscription created"
test_event "customer.subscription.updated" "Subscription updated"
test_event "customer.subscription.deleted" "Subscription cancelled"
test_event "customer.subscription.paused" "Subscription paused"
test_event "customer.subscription.resumed" "Subscription resumed"

echo ""
echo -e "${YELLOW}=== INVOICE EVENTS ===${NC}"
echo ""

test_event "invoice.created" "Invoice created (draft)"
test_event "invoice.finalized" "Invoice finalized (ready for payment)"
test_event "invoice.payment_succeeded" "Payment succeeded"
test_event "invoice.payment_failed" "Payment failed"

echo ""
echo -e "${GREEN}=================================="
echo "✅ All webhook tests completed!"
echo "==================================${NC}"
echo ""
echo "Next steps:"
echo "1. Check your server logs for webhook processing"
echo "2. Check database tables:"
echo "   - stripe_events (all events logged)"
echo "   - stripe_subscriptions (subscription data)"
echo "   - invoices (invoice data)"
echo "   - stripe_customers (customer status, grace period)"
echo "3. Check for any processing errors:"
echo "   SELECT * FROM stripe_events WHERE processing_error IS NOT NULL;"
echo ""
echo "To view Stripe logs:"
echo "  stripe logs tail"
echo ""

