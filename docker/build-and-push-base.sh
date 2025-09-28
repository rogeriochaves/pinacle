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
echo "📦 Building Docker image..."

IMAGE_NAME="$DOCKERHUB_USERNAME/pinacle-base:latest"

# Build the Docker image
docker build -t "$IMAGE_NAME" --platform=linux/arm64 -f docker/Dockerfile.base .

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

echo "🚀 Pushing Docker image to Docker Hub..."

# Push the image
docker push "$IMAGE_NAME"

echo "✅ Successfully pushed $IMAGE_NAME to Docker Hub!"