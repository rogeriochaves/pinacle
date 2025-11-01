#!/usr/bin/env bash

set -eo pipefail

if [[ -z $DOCKER_HOST ]]; then
  echo "DOCKER_HOST is not set, probably not pointing to rchaves-platform, exiting"
  exit 1
fi

echo "🔨 Building locally..."
pnpm build

echo "🐳 Building and deploying Docker image..."
docker compose -f docker-compose.yml up -d --build

echo "✅ Deployment complete!"
echo "📊 Logs: docker compose logs -f"