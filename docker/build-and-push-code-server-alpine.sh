#!/bin/bash

# Exit on any error
set -e

if [ ! -f ".env" ]; then
    cd ../
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found in the current directory"
    echo "Please create a .env file with DOCKERHUB_USERNAME and DOCKERHUB_TOKEN"
    exit 1
fi

# Load environment variables and check if required ones exist
echo "🔍 Loading environment variables from .env..."

export DOCKERHUB_USERNAME=$(npx dotenv -c -- bash -c 'echo $DOCKERHUB_USERNAME')
export DOCKERHUB_TOKEN=$(npx dotenv -c -- bash -c 'echo $DOCKERHUB_TOKEN')

if [ -z "$DOCKERHUB_USERNAME" ]; then
    echo "❌ Error: DOCKERHUB_USERNAME not found in .env file"
    exit 1
fi

if [ -z "$DOCKERHUB_TOKEN" ]; then
    echo "❌ Error: DOCKERHUB_TOKEN not found in .env file"
    exit 1
fi

echo "✅ Environment variables loaded successfully"
echo "📦 Setting up multi-platform builder..."

# Create or use existing buildx builder for multi-platform builds
BUILDER_NAME="multiarch-builder"
if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
    echo "🔧 Creating new buildx builder: $BUILDER_NAME"
    docker buildx create --name "$BUILDER_NAME" --driver docker-container --bootstrap
else
    echo "✅ Using existing buildx builder: $BUILDER_NAME"
fi

# Use the multi-platform builder
docker buildx use "$BUILDER_NAME"

IMAGE_NAME="$DOCKERHUB_USERNAME/code-server-alpine:4.104.2"

echo "📦 Building multi-platform Docker image for linux/amd64 and linux/arm64..."

echo "🔐 Setting up temporary Docker config..."
# Create a temporary directory for Docker config to avoid affecting global login
TEMP_DOCKER_CONFIG=$(mktemp -d)
export DOCKER_CONFIG="$TEMP_DOCKER_CONFIG"

# Cleanup function to remove temp config on exit
cleanup() {
    echo "🧹 Cleaning up temporary Docker config..."
    rm -rf "$TEMP_DOCKER_CONFIG"
}
trap cleanup EXIT

# Login to Docker Hub using the token (in temporary config)
echo "$DOCKERHUB_TOKEN" | docker login --username "$DOCKERHUB_USERNAME" --password-stdin

echo "🚀 Building and pushing multi-platform Docker image to Docker Hub..."

# Build and push the multi-platform image directly
# This creates a manifest list that supports both architectures
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --tag "$IMAGE_NAME" \
    --file docker/Dockerfile.code-server-alpine \
    --push \
    .

echo "✅ Successfully built and pushed multi-platform $IMAGE_NAME to Docker Hub!"
echo "🏗️  Supported architectures: linux/amd64, linux/arm64"