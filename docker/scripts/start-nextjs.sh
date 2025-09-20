#!/bin/bash

# Start Next.js development pod
echo "🚀 Starting Pinacle Next.js Development Environment"

# Check if workspace has a Next.js project
if [ ! -f "/workspace/package.json" ]; then
    echo "📦 No existing project found. Creating new Next.js project..."

    # Copy the pre-built template
    cp -r /tmp/nextjs-template/* /workspace/
    cp /tmp/nextjs-template/.* /workspace/ 2>/dev/null || true

    # Install dependencies
    cd /workspace
    pnpm install

    echo "✅ Next.js project created successfully!"
else
    echo "📁 Existing project found. Checking dependencies..."
    cd /workspace

    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing dependencies..."
        pnpm install
    fi
fi

# Start VS Code Server in the background
echo "🔧 Starting VS Code Server..."
code-server --bind-addr 0.0.0.0:8080 /workspace &

# Wait for VS Code Server to start
sleep 5

# Start Next.js development server if package.json has dev script
if grep -q '"dev"' /workspace/package.json; then
    echo "⚡ Starting Next.js development server..."
    cd /workspace
    pnpm dev &
fi

# Keep the container running
echo "🎉 Pinacle Next.js environment is ready!"
echo "📝 VS Code Server: http://localhost:8080"
echo "⚡ Next.js App: http://localhost:3000"
echo ""
echo "Happy coding! 🚀"

# Wait for all background processes
wait

