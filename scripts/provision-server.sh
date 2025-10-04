#!/bin/bash
set -e

# Pinacle Server Provisioning Script
#
# Provisions a compute server with:
# - Node.js
# - Docker + gVisor
# - Pinacle server agent
#
# Usage:
#   ./provision-server.sh --api-url https://api.pinacle.dev --api-key YOUR_KEY [--host lima:gvisor-alpine]
#   ./provision-server.sh --api-url http://localhost:3000 --api-key test-key --host ssh:user@server.com

API_URL=""
API_KEY=""
HOST="local"
AGENT_PATH="/opt/pinacle/server-agent"
HEARTBEAT_INTERVAL="30000"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --api-url)
      API_URL="$2"
      shift 2
      ;;
    --api-key)
      API_KEY="$2"
      shift 2
      ;;
    --host)
      HOST="$2"
      shift 2
      ;;
    --heartbeat-interval)
      HEARTBEAT_INTERVAL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required args
if [ -z "$API_URL" ] || [ -z "$API_KEY" ]; then
  echo "Error: --api-url and --api-key are required"
  echo ""
  echo "Usage:"
  echo "  $0 --api-url URL --api-key KEY [--host HOST]"
  echo ""
  echo "Examples:"
  echo "  # Provision Lima VM (for testing)"
  echo "  $0 --api-url http://localhost:3000 --api-key test-key --host lima:gvisor-alpine"
  echo ""
  echo "  # Provision remote server via SSH"
  echo "  $0 --api-url https://api.pinacle.dev --api-key prod-key --host ssh:root@192.168.1.100"
  echo ""
  echo "  # Provision local machine"
  echo "  $0 --api-url http://localhost:3000 --api-key test-key --host local"
  exit 1
fi

# Determine command prefix based on host type
CMD_PREFIX=""
COPY_CMD="cp -r"
if [[ $HOST == lima:* ]]; then
  LIMA_VM="${HOST#lima:}"
  CMD_PREFIX="limactl shell $LIMA_VM --"
  COPY_CMD="limactl copy"
  echo "🖥️  Provisioning Lima VM: $LIMA_VM"
elif [[ $HOST == ssh:* ]]; then
  SSH_HOST="${HOST#ssh:}"
  CMD_PREFIX="ssh $SSH_HOST"
  COPY_CMD="scp -r"
  echo "🖥️  Provisioning remote server: $SSH_HOST"
elif [[ $HOST == "local" ]]; then
  echo "🖥️  Provisioning local machine"
else
  echo "Error: Invalid host format. Use lima:VM_NAME, ssh:user@host, or local"
  exit 1
fi

# Helper function to run commands on target
run_remote() {
  if [ -z "$CMD_PREFIX" ]; then
    eval "$@"
  else
    $CMD_PREFIX "$@"
  fi
}

# Helper function to copy files
copy_to_remote() {
  local src=$1
  local dest=$2

  if [[ $HOST == lima:* ]]; then
    limactl copy "$src" "$LIMA_VM:$dest"
  elif [[ $HOST == ssh:* ]]; then
    scp -r "$src" "$SSH_HOST:$dest"
  else
    cp -r "$src" "$dest"
  fi
}

echo "📦 Step 1: Installing Node.js..."
if run_remote which node > /dev/null 2>&1; then
  echo "✅ Node.js already installed"
else
  # Detect OS and install Node.js
  if run_remote which apk > /dev/null 2>&1; then
    # Alpine Linux (Lima VM)
    run_remote sudo apk add --no-cache nodejs npm
  elif run_remote which apt-get > /dev/null 2>&1; then
    # Debian/Ubuntu
    run_remote sudo apt-get update
    run_remote sudo apt-get install -y curl
    run_remote curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
    run_remote sudo apt-get install -y nodejs
  elif run_remote which yum > /dev/null 2>&1; then
    # CentOS/RHEL
    run_remote curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    run_remote sudo yum install -y nodejs
  else
    echo "❌ Unsupported OS. Please install Node.js manually."
    exit 1
  fi
  echo "✅ Node.js installed"
fi

echo "🐳 Step 2: Checking Docker..."
if run_remote which docker > /dev/null 2>&1; then
  echo "✅ Docker already installed"
else
  echo "⚠️  Docker not found. Skipping (should already be set up for pod hosting)"
fi

echo "📁 Step 3: Creating agent directory..."
if [[ $HOST == lima:* ]]; then
  limactl shell "$LIMA_VM" -- sudo mkdir -p "$AGENT_PATH"
  limactl shell "$LIMA_VM" -- sh -c "sudo chown -R \$USER '$AGENT_PATH'"
elif [[ $HOST == ssh:* ]]; then
  ssh "$SSH_HOST" "sudo mkdir -p '$AGENT_PATH' && sudo chown -R \$USER '$AGENT_PATH'"
else
  sudo mkdir -p "$AGENT_PATH"
  sudo chown -R "$USER" "$AGENT_PATH"
fi
echo "✅ Directory created: $AGENT_PATH"

echo "📋 Step 4: Building and copying agent..."
cd "$(dirname "$0")/.."
cd server-agent

# Build agent
echo "🔨 Building agent..."
npm run build

# Copy files to target
echo "📤 Copying files..."
if [[ $HOST == lima:* ]]; then
  # limactl copy has issues with directories, so we tar first
  tar czf /tmp/pinacle-agent.tar.gz dist package.json
  limactl copy /tmp/pinacle-agent.tar.gz "$LIMA_VM:$AGENT_PATH/"
  limactl shell "$LIMA_VM" -- sh -c "cd $AGENT_PATH && tar xzf pinacle-agent.tar.gz && rm pinacle-agent.tar.gz"
  rm /tmp/pinacle-agent.tar.gz
elif [[ $HOST == ssh:* ]]; then
  scp -r dist "$SSH_HOST:$AGENT_PATH/"
  scp package.json "$SSH_HOST:$AGENT_PATH/"
else
  cp -r dist "$AGENT_PATH/"
  cp package.json "$AGENT_PATH/"
fi

echo "✅ Agent copied"

echo "📦 Step 5: Installing dependencies..."
run_remote sh -c "cd $AGENT_PATH && npm install --production"
echo "✅ Dependencies installed"

echo "⚙️  Step 6: Creating configuration..."
# Adjust API_URL for Lima (host.lima.internal allows Lima to reach host)
if [[ $HOST == lima:* ]] && [[ $API_URL == http://localhost:* ]]; then
  PORT="${API_URL##*:}"
  API_URL="http://host.lima.internal:$PORT"
  echo "   Adjusted API_URL for Lima: $API_URL"
fi

ENV_CONTENT="API_URL=$API_URL
API_KEY=$API_KEY
HEARTBEAT_INTERVAL_MS=$HEARTBEAT_INTERVAL"

if [[ $HOST == lima:* ]]; then
  limactl shell "$LIMA_VM" -- sh -c "echo '$ENV_CONTENT' > $AGENT_PATH/.env"
elif [[ $HOST == ssh:* ]]; then
  echo "$ENV_CONTENT" | ssh "$SSH_HOST" "cat > $AGENT_PATH/.env"
else
  echo "$ENV_CONTENT" > "$AGENT_PATH/.env"
fi

echo "✅ Configuration created"

echo "🚀 Step 7: Starting agent..."
if [[ $HOST == lima:* ]]; then
  # Create OpenRC init script for Alpine
  limactl shell "$LIMA_VM" -- sudo tee /etc/init.d/pinacle-agent > /dev/null << 'EOF'
#!/sbin/openrc-run

name="Pinacle Server Agent"
description="Pinacle Server Agent for pod orchestration"
command="/usr/bin/node"
command_args="/opt/pinacle/server-agent/dist/index.js"
command_background=true
directory="/opt/pinacle/server-agent"
pidfile="/run/pinacle-agent.pid"
output_log="/var/log/pinacle-agent.log"
error_log="/var/log/pinacle-agent.err"

depend() {
    need net
    after docker
}
EOF

  # Make it executable and enable
  limactl shell "$LIMA_VM" -- sudo chmod +x /etc/init.d/pinacle-agent
  limactl shell "$LIMA_VM" -- sudo rc-update add pinacle-agent default || true

  # Stop if already running, then start
  limactl shell "$LIMA_VM" -- sudo rc-service pinacle-agent stop || true
  limactl shell "$LIMA_VM" -- sudo rc-service pinacle-agent start

  echo "✅ Agent installed as OpenRC service"
elif [[ $HOST == ssh:* ]]; then
  # Install as systemd service on remote servers
  ssh "$SSH_HOST" "cat > /etc/systemd/system/pinacle-agent.service" << EOF
[Unit]
Description=Pinacle Server Agent
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=$AGENT_PATH
ExecStart=/usr/bin/node $AGENT_PATH/dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

  ssh "$SSH_HOST" systemctl daemon-reload
  ssh "$SSH_HOST" systemctl enable pinacle-agent
  ssh "$SSH_HOST" systemctl restart pinacle-agent

  echo "✅ Agent installed as systemd service"
else
  # Local: just start it
  cd "$AGENT_PATH"
  nohup node dist/index.js > /tmp/pinacle-agent.log 2>&1 &
  echo "✅ Agent started locally"
fi

echo ""
echo "✅ Server provisioned successfully!"
echo ""
echo "📊 To check agent logs:"
if [[ $HOST == lima:* ]]; then
  echo "   limactl shell $LIMA_VM -- tail -f /var/log/pinacle-agent.log"
  echo "   limactl shell $LIMA_VM -- sudo rc-service pinacle-agent status"
elif [[ $HOST == ssh:* ]]; then
  echo "   ssh $SSH_HOST journalctl -u pinacle-agent -f"
else
  echo "   tail -f /tmp/pinacle-agent.log"
fi
echo ""

