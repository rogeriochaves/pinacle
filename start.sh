#!/bin/sh
set -e

# Start server in background
node server.js &
SERVER_PID=$!

# Start worker in background
node src/worker.js &
WORKER_PID=$!

# Function to handle shutdown
cleanup() {
  echo "Shutting down..."
  kill $SERVER_PID $WORKER_PID 2>/dev/null || true
  exit 0
}

# Trap signals
trap cleanup SIGTERM SIGINT

# Wait for both processes
wait $SERVER_PID $WORKER_PID

