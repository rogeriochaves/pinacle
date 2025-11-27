#!/usr/bin/env bash

set -eo pipefail

if [[ -z $DOCKER_HOST ]]; then
  echo "DOCKER_HOST is not set, probably not pointing to rchaves-platform, exiting"
  exit 1
fi

# Check if .env has localhost NEXTAUTH_URL uncommented
if [[ -f .env ]] && grep -q "^[[:space:]]*NEXTAUTH_URL=http://localhost:4000" .env; then
  echo "❌ Error: .env file contains uncommented NEXTAUTH_URL=http://localhost:4000"
  echo "   This is a local testing configuration and should not be deployed."
  echo "   Please comment out or remove this line before deploying."
  exit 1
fi

# Check if local dev server is running on port 3000 or 4000
if lsof -i :3000 -sTCP:LISTEN >/dev/null 2>&1 || lsof -i :4000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "❌ Error: A server is already running on port 3000 or 4000"
  echo "   Please kill the local dev server first to avoid .next folder conflicts."
  exit 1
fi

echo "🔨 Building locally..."
pnpm build

echo "🐳 Building and deploying Docker image..."
docker compose -f docker-compose.yml up -d --build

echo "✅ Deployment complete!"
echo "📊 Logs: docker compose logs -f"