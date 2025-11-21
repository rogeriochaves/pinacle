#!/bin/bash
set -e

# Dev provisioning script with automatic cloudflared tunnel
#
# This script:
# 1. Starts cloudflared tunnel to localhost:3000
# 2. Extracts the tunnel URL automatically
# 3. Provisions the dev server with that URL
# 4. Keeps cloudflared running in foreground (Ctrl+C to stop)

echo "🌐 Starting cloudflared tunnel to localhost:3000..."

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared is not installed!"
    echo ""
    echo "Install it with:"
    echo "  macOS:   brew install cloudflared"
    echo "  Linux:   See https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
    exit 1
fi

# Check if required env vars are set
if [ -z "$DEV_SERVER_HOST" ]; then
    echo "❌ DEV_SERVER_HOST is not set!"
    echo "Set it in .env.local: DEV_SERVER_HOST=\"root@157.90.177.85\""
    exit 1
fi

if [ -z "$SERVER_API_KEY" ]; then
    echo "❌ SERVER_API_KEY is not set!"
    echo "Set it in .env.local (this is the dev API key)"
    exit 1
fi

# SERVER_API_KEY will be used as the dev API key
DEV_API_KEY="$SERVER_API_KEY"

if [ -z "$SSH_PUBLIC_KEY" ]; then
    echo "❌ SSH_PUBLIC_KEY is not set!"
    echo "Set it with: export SSH_PUBLIC_KEY=\"\$(cat ~/.ssh/id_ed25519.pub)\""
    exit 1
fi

# Create a temporary file for cloudflared output
CLOUDFLARED_LOG=$(mktemp)
TUNNEL_URL=""

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Shutting down cloudflared tunnel..."
    if [ -n "$CLOUDFLARED_PID" ]; then
        kill $CLOUDFLARED_PID 2>/dev/null || true
    fi
    rm -f "$CLOUDFLARED_LOG"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start cloudflared in background to capture URL
echo "   Starting tunnel (this may take a few seconds)..."
cloudflared tunnel --url http://localhost:3000 > "$CLOUDFLARED_LOG" 2>&1 &
CLOUDFLARED_PID=$!

# Wait for tunnel URL to appear in logs (max 30 seconds)
echo "   Waiting for tunnel URL..."
TIMEOUT=30
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    if [ -f "$CLOUDFLARED_LOG" ]; then
        # Look for the tunnel URL in the logs
        TUNNEL_URL=$(grep -o "https://.*\.trycloudflare\.com" "$CLOUDFLARED_LOG" | head -n1)
        if [ -n "$TUNNEL_URL" ]; then
            break
        fi
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
    echo -n "."
done
echo ""

if [ -z "$TUNNEL_URL" ]; then
    echo "❌ Failed to get tunnel URL after ${TIMEOUT}s"
    echo ""
    echo "Cloudflared logs:"
    cat "$CLOUDFLARED_LOG"
    cleanup
    exit 1
fi

echo "✅ Tunnel established: $TUNNEL_URL"
echo ""
echo "📋 Starting server provisioning..."
echo "   Production URL: https://pinacle.dev (will preserve existing prod API key on server)"
echo "   Dev URL: $TUNNEL_URL (using dev API key for local development)"
echo ""

# Export the tunnel URL and run provision script
export DEV_API_URL="$TUNNEL_URL"

# Run provision script in foreground
# Note: we don't pass --api-key for prod because we want to preserve the existing prod key on the server
# We only pass --dev-api-key for the dev/tunnel URL
./scripts/provision-server.sh \
    --api-url https://pinacle.dev \
    --dev-api-url "$TUNNEL_URL" \
    --dev-api-key "$DEV_API_KEY" \
    --host "ssh:$DEV_SERVER_HOST" \
    --heartbeat-interval 5000

PROVISION_EXIT=$?

if [ $PROVISION_EXIT -ne 0 ]; then
    echo ""
    echo "❌ Provisioning failed with exit code $PROVISION_EXIT"
    cleanup
    exit $PROVISION_EXIT
fi

echo ""
echo "✅ Provisioning complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Cloudflared tunnel is now running in foreground"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "   Tunnel URL: $TUNNEL_URL"
echo "   Target: http://localhost:3000"
echo ""
echo "   Server agent is reporting to both:"
echo "   • Production: https://pinacle.dev"
echo "   • Dev: $TUNNEL_URL (your local instance)"
echo ""
echo "Press Ctrl+C to stop the tunnel and exit"
echo ""

# Now show cloudflared logs in foreground
tail -f "$CLOUDFLARED_LOG" &
TAIL_PID=$!

# Wait for cloudflared process
wait $CLOUDFLARED_PID

# Cleanup
kill $TAIL_PID 2>/dev/null || true
cleanup

