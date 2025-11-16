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
echo "🔄 Switching to multi-platform builder: $BUILDER_NAME"
docker buildx use "$BUILDER_NAME"

IMAGE_NAME="$DOCKERHUB_USERNAME/pinacle-base:latest"

echo "📦 Building multi-platform Docker image for linux/amd64 and linux/arm64..."

echo "🔐 Logging in to Docker Hub..."
# Login to Docker Hub using the token (using global config to preserve builder settings)
echo "$DOCKERHUB_TOKEN" | docker login --username "$DOCKERHUB_USERNAME" --password-stdin

echo "🚀 Building platforms separately for safety..."

# Build AMD64 first (the slower/riskier one due to emulation)
echo "📦 Step 1/3: Building AMD64 platform..."
docker buildx build \
    --builder "$BUILDER_NAME" \
    --platform linux/amd64 \
    --tag "$IMAGE_NAME-amd64" \
    --file docker/Dockerfile.base \
    --push \
    .

echo "✅ AMD64 build complete and pushed!"

# Build ARM64 second (should be fast on your M3 Mac)
echo "📦 Step 2/3: Building ARM64 platform..."
docker buildx build \
    --builder "$BUILDER_NAME" \
    --platform linux/arm64 \
    --tag "$IMAGE_NAME-arm64" \
    --file docker/Dockerfile.base \
    --push \
    .

echo "✅ ARM64 build complete and pushed!"

# Create multi-platform manifest combining both
echo "📦 Step 3/3: Creating multi-platform manifest..."
docker buildx imagetools create \
    --tag "$IMAGE_NAME" \
    "$IMAGE_NAME-amd64" \
    "$IMAGE_NAME-arm64"

echo "✅ Multi-platform manifest created!"

echo "🧹 Logging out from Docker Hub..."
docker logout
echo "✅ Successfully built and pushed multi-platform $IMAGE_NAME to Docker Hub!"
echo "🏗️  Supported architectures: linux/amd64, linux/arm64"