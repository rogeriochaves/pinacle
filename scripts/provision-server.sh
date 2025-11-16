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
API_KEY=$SERVER_API_KEY
HOST=""
AGENT_PATH="/usr/local/pinacle/server-agent"
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
if [ -z "$API_URL" ] || [ -z "$API_KEY" ] || [ -z "$HOST" ]; then
  echo "Error: --api-url, --api-key and --host are required"
  echo ""
  echo "Usage:"
  echo "  $0 --api-url URL --api-key KEY --host HOST"
  echo ""
  echo "Examples:"
  echo "  # Provision Lima VM (for testing)"
  echo "  $0 --api-url http://localhost:3000 --api-key test-key --host lima:gvisor-alpine"
  echo ""
  echo "  # Provision remote server via SSH"
  echo "  $0 --api-url https://pinacle.dev --api-key prod-key --host ssh:root@192.168.1.100"
  echo ""
  echo "  # Provision local machine"
  echo "  $0 --api-url http://localhost:3000 --api-key test-key --host local"
  exit 1
fi

# Validate SSH public key is set
if [ -z "$SSH_PUBLIC_KEY" ]; then
  echo "Error: SSH_PUBLIC_KEY environment variable is required"
  echo "       Set it with: export SSH_PUBLIC_KEY=\"\$(cat ~/.ssh/id_ed25519.pub)\""
  echo "       Or generate new keys with: ssh-keygen -t ed25519"
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
    run_remote "curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -"
    run_remote sudo apt-get install -y nodejs
  elif run_remote which yum > /dev/null 2>&1; then
    # CentOS/RHEL
    run_remote "curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -"
    run_remote sudo yum install -y nodejs
  else
    echo "❌ Unsupported OS. Please install Node.js manually."
    exit 1
  fi
  echo "✅ Node.js installed"
fi

echo "🐳 Step 2: Installing Docker..."
if run_remote which docker > /dev/null 2>&1; then
  echo "✅ Docker already installed"
else
  # Detect OS and install Docker
  if run_remote which apk > /dev/null 2>&1; then
    # Alpine Linux (Lima VM)
    run_remote sudo apk add --no-cache docker docker-cli-compose
    run_remote sudo rc-update add docker boot
    run_remote sudo service docker start || true
  elif run_remote which apt-get > /dev/null 2>&1; then
    # Debian/Ubuntu - Install Docker from official repository
    echo "   Installing Docker on Debian/Ubuntu..."
    run_remote "sudo apt-get update"
    run_remote "sudo apt-get install -y ca-certificates curl"
    run_remote "sudo install -m 0755 -d /etc/apt/keyrings"

    # Detect if Debian or Ubuntu and use correct URL
    OS_ID=$(run_remote "grep ^ID= /etc/os-release | cut -d= -f2 | tr -d '\"'" 2>/dev/null || echo "debian")
    if [[ "$OS_ID" == "ubuntu" ]]; then
      DOCKER_URL="https://download.docker.com/linux/ubuntu"
    else
      DOCKER_URL="https://download.docker.com/linux/debian"
    fi

    echo "   Detected OS: $OS_ID, using $DOCKER_URL"

    # Add Docker's official GPG key
    run_remote "sudo curl -fsSL $DOCKER_URL/gpg -o /etc/apt/keyrings/docker.asc"
    run_remote "sudo chmod a+r /etc/apt/keyrings/docker.asc"

    VERSION_CODENAME=$(run_remote ". /etc/os-release && echo \"\$VERSION_CODENAME\"")

    echo "   Detected VERSION_CODENAME: $VERSION_CODENAME"

    # Add the repository to Apt sources using modern .sources format
    run_remote "sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: $DOCKER_URL
Suites: $VERSION_CODENAME
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF"

    # Install Docker
    run_remote "sudo apt-get update"
    run_remote "sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"

    # Start and enable Docker
    run_remote "sudo systemctl start docker"
    run_remote "sudo systemctl enable docker"
  elif run_remote which yum > /dev/null 2>&1; then
    # CentOS/RHEL - Install Docker from official repository
    echo "   Installing Docker on CentOS/RHEL..."
    run_remote "sudo yum install -y yum-utils"
    run_remote "sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo"
    run_remote "sudo yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"

    # Start and enable Docker
    run_remote "sudo systemctl start docker"
    run_remote "sudo systemctl enable docker"
  else
    echo "❌ Unsupported OS. Please install Docker manually."
    exit 1
  fi
  echo "✅ Docker installed"
fi

echo "💾 Step 2.5: Setting up XFS storage with quotas for Docker volumes..."
# Check if XFS volume already exists
if run_remote "mount | grep -q '/var/lib/docker/volumes.*xfs'"; then
  echo "✅ XFS storage already configured"
else
  # Get available space on root filesystem (in GB, use 85% of available)
  AVAILABLE_KB=$(run_remote "df / | tail -1 | awk '{print \$4}'")
  AVAILABLE_GB=$((AVAILABLE_KB / 1024 / 1024))
  VOLUME_SIZE_GB=$((AVAILABLE_GB * 85 / 100))

  echo "   Available space: ${AVAILABLE_GB}GB, using ${VOLUME_SIZE_GB}GB for Docker volumes"

  # Stop Docker temporarily
  if run_remote which systemctl > /dev/null 2>&1; then
    run_remote "sudo systemctl stop docker" || true
  elif run_remote which rc-service > /dev/null 2>&1; then
    run_remote "sudo rc-service docker stop" || true
  fi

  # Create loopback XFS file
  echo "   Creating ${VOLUME_SIZE_GB}GB XFS loopback file..."
  run_remote "sudo fallocate -l ${VOLUME_SIZE_GB}G /var/lib/docker-volumes.xfs"

  # Format as XFS with project quota support
  echo "   Formatting as XFS with project quota support..."
  run_remote "sudo mkfs.xfs -n ftype=1 -m crc=1 /var/lib/docker-volumes.xfs"

  # Create mount point and mount with pquota
  run_remote "sudo mkdir -p /var/lib/docker/volumes"
  run_remote "sudo mount -o loop,pquota /var/lib/docker-volumes.xfs /var/lib/docker/volumes"

  # Add to /etc/fstab for persistence
  echo "   Adding to /etc/fstab for automatic mounting..."
  run_remote "echo '/var/lib/docker-volumes.xfs /var/lib/docker/volumes xfs loop,pquota 0 0' | sudo tee -a /etc/fstab"

  # Update Docker daemon configuration to enable storage driver options
  echo "   Configuring Docker daemon for XFS quotas..."
  run_remote "sudo mkdir -p /etc/docker"

  # Update daemon.json preserving existing config
  EXISTING_CONFIG=$(run_remote "cat /etc/docker/daemon.json 2>/dev/null || echo '{}'")

  # Use jq if available, otherwise do simple merge
  if run_remote which jq > /dev/null 2>&1; then
    run_remote "echo '$EXISTING_CONFIG' | jq '. + {\"data-root\": \"/var/lib/docker\", \"storage-driver\": \"overlay2\"}' | sudo tee /etc/docker/daemon.json > /dev/null"
  else
    # Fallback: reconstruct config (preserving runtimes)
    if [[ "$EXISTING_CONFIG" == *"runsc"* ]]; then
      run_remote "sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  \"data-root\": \"/var/lib/docker\",
  \"storage-driver\": \"overlay2\",
  \"runtimes\": {
    \"runsc\": {
      \"path\": \"/usr/bin/runsc\"
    }
  }
}
EOF"
    else
      run_remote "sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  \"data-root\": \"/var/lib/docker\",
  \"storage-driver\": \"overlay2\"
}
EOF"
    fi
  fi

  # Start Docker
  if run_remote which systemctl > /dev/null 2>&1; then
    run_remote "sudo systemctl start docker"
  elif run_remote which rc-service > /dev/null 2>&1; then
    run_remote "sudo rc-service docker start"
  fi

  echo "✅ XFS storage configured with quota support (${VOLUME_SIZE_GB}GB)"
fi

echo "🔒 Step 3: Installing gVisor..."
GVISOR_NEEDS_CONFIG=false
if run_remote which runsc > /dev/null 2>&1; then
  echo "✅ gVisor already installed"
  RUNSC_PATH=$(run_remote which runsc)

  # Check if Docker already knows about runsc runtime
  if run_remote "docker info 2>/dev/null | grep -q 'runsc'"; then
    echo "   Docker already configured with gVisor runtime"
  else
    echo "   Docker needs gVisor runtime configuration"
    GVISOR_NEEDS_CONFIG=true
  fi
else
  GVISOR_NEEDS_CONFIG=true
  # Detect OS and install gVisor
  if run_remote which apk > /dev/null 2>&1; then
    # Alpine Linux - Manual installation
    echo "   Installing gVisor manually on Alpine..."
    run_remote "cd /tmp && wget https://storage.googleapis.com/gvisor/releases/release/latest/x86_64/runsc https://storage.googleapis.com/gvisor/releases/release/latest/x86_64/runsc.sha512 https://storage.googleapis.com/gvisor/releases/release/latest/x86_64/containerd-shim-runsc-v1 https://storage.googleapis.com/gvisor/releases/release/latest/x86_64/containerd-shim-runsc-v1.sha512"
    run_remote "cd /tmp && sha512sum -c runsc.sha512 && sha512sum -c containerd-shim-runsc-v1.sha512"
    run_remote "cd /tmp && chmod a+rx runsc containerd-shim-runsc-v1"
    run_remote "sudo mv /tmp/runsc /tmp/containerd-shim-runsc-v1 /usr/local/bin/"
    run_remote "cd /tmp && rm -f *.sha512"
  elif run_remote which apt-get > /dev/null 2>&1; then
    # Debian/Ubuntu - Use APT repository
    echo "   Installing gVisor from APT repository..."
    run_remote "sudo apt-get update"
    run_remote "sudo apt-get install -y apt-transport-https ca-certificates curl gnupg"
    run_remote "curl -fsSL https://gvisor.dev/archive.key | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg"
    run_remote "echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main\" | sudo tee /etc/apt/sources.list.d/gvisor.list > /dev/null"
    run_remote "sudo apt-get update"
    run_remote "sudo apt-get install -y runsc"
    echo "   gVisor installed via APT"
  elif run_remote which yum > /dev/null 2>&1; then
    # CentOS/RHEL - Manual installation
    echo "   Installing gVisor manually on CentOS/RHEL..."
    run_remote "cd /tmp && wget https://storage.googleapis.com/gvisor/releases/release/latest/x86_64/runsc https://storage.googleapis.com/gvisor/releases/release/latest/x86_64/runsc.sha512 https://storage.googleapis.com/gvisor/releases/release/latest/x86_64/containerd-shim-runsc-v1 https://storage.googleapis.com/gvisor/releases/release/latest/x86_64/containerd-shim-runsc-v1.sha512"
    run_remote "cd /tmp && sha512sum -c runsc.sha512 && sha512sum -c containerd-shim-runsc-v1.sha512"
    run_remote "cd /tmp && chmod a+rx runsc containerd-shim-runsc-v1"
    run_remote "sudo mv /tmp/runsc /tmp/containerd-shim-runsc-v1 /usr/local/bin/"
    run_remote "cd /tmp && rm -f *.sha512"
  else
    echo "❌ Unsupported OS for gVisor installation."
    exit 1
  fi

  echo "✅ gVisor binary installed"
fi

# Configure Docker to use gVisor runtime only if needed
if [ "$GVISOR_NEEDS_CONFIG" = true ]; then
  echo "   Configuring Docker to use gVisor runtime..."

  # Find the runsc binary (APT installs to /usr/bin, manual to /usr/local/bin)
  if [ -z "$RUNSC_PATH" ]; then
    RUNSC_PATH=$(run_remote which runsc 2>/dev/null || echo "")
  fi

  if [ -z "$RUNSC_PATH" ]; then
    echo "❌ runsc binary not found in PATH"
    exit 1
  fi

  run_remote "$RUNSC_PATH install"

  # Restart Docker to pick up the new runtime
  echo "   Restarting Docker to apply gVisor configuration..."
  if run_remote which systemctl > /dev/null 2>&1; then
    run_remote "sudo systemctl restart docker"
  elif run_remote which rc-service > /dev/null 2>&1; then
    run_remote "sudo rc-service docker restart"
  fi

  echo "✅ gVisor configured with Docker"
else
  echo "✅ gVisor already configured with Docker"
fi

# Verify gVisor works with Docker (CRITICAL - must succeed)
echo "   Verifying gVisor with Docker..."
if run_remote "docker run --rm --runtime=runsc hello-world" 2>&1 | tee /tmp/gvisor-test.log; then
  echo "✅ gVisor runtime verified successfully"
else
  echo "❌ gVisor verification FAILED - this is critical for security!"
  echo "   Please check Docker configuration and ensure gVisor is properly installed."
  run_remote "docker info | grep -i runtime" || true
  exit 1
fi

echo "📁 Step 4: Creating agent directory and log file..."
if [[ $HOST == lima:* ]]; then
  limactl shell "$LIMA_VM" -- sudo mkdir -p "$AGENT_PATH"
  limactl shell "$LIMA_VM" -- sh -c "sudo chown -R \$USER '$AGENT_PATH'"
  limactl shell "$LIMA_VM" -- sudo mkdir -p "/var/lib/pinacle/snapshots"
  limactl shell "$LIMA_VM" -- sh -c "sudo chown -R \$USER '/var/lib/pinacle/snapshots'"
  limactl shell "$LIMA_VM" -- sudo touch /var/log/pinacle-agent.log
  limactl shell "$LIMA_VM" -- sudo chmod 666 /var/log/pinacle-agent.log
elif [[ $HOST == ssh:* ]]; then
  ssh "$SSH_HOST" "sudo mkdir -p '$AGENT_PATH' && sudo chown -R \$USER '$AGENT_PATH'"
  ssh "$SSH_HOST" "sudo mkdir -p '/var/lib/pinacle/snapshots' && sudo chown -R \$USER '/var/lib/pinacle/snapshots'"
  ssh "$SSH_HOST" "sudo touch /var/log/pinacle-agent.log && sudo chmod 666 /var/log/pinacle-agent.log"
else
  sudo mkdir -p "$AGENT_PATH"
  sudo chown -R "$USER" "$AGENT_PATH"
  sudo mkdir -p "/var/lib/pinacle/snapshots"
  sudo chown -R "$USER" "/var/lib/pinacle/snapshots"
  sudo touch /var/log/pinacle-agent.log
  sudo chmod 666 /var/log/pinacle-agent.log
fi
echo "✅ Directory created: $AGENT_PATH"
echo "✅ Log file created: /var/log/pinacle-agent.log (writable by all)"

echo "📋 Step 5: Building and copying agent..."
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

echo "📦 Step 6: Installing dependencies..."
run_remote "cd $AGENT_PATH && npm install --production"
echo "✅ Dependencies installed"

echo "🔑 Step 6: Installing SSH public key..."
# Install SSH key for main server access
if [[ $HOST == lima:* ]]; then
  limactl shell "$LIMA_VM" -- sh -c "mkdir -p ~/.ssh && chmod 700 ~/.ssh"
  limactl shell "$LIMA_VM" -- sh -c "echo '$SSH_PUBLIC_KEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
elif [[ $HOST == ssh:* ]]; then
  ssh "$SSH_HOST" "mkdir -p ~/.ssh && chmod 700 ~/.ssh"
  ssh "$SSH_HOST" "echo '$SSH_PUBLIC_KEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
else
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  echo "$SSH_PUBLIC_KEY" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
fi
echo "✅ SSH key installed"

echo "⚙️  Step 7: Creating configuration..."
# Adjust API_URL for Lima (host.lima.internal allows Lima to reach host)
if [[ $HOST == lima:* ]] && [[ $API_URL == http://localhost:* ]]; then
  PORT="${API_URL##*:}"
  API_URL="http://host.lima.internal:$PORT"
  echo "   Adjusted API_URL for Lima: $API_URL"
fi

# Extract SSH connection details
SSH_HOST_ADDR=""
SSH_PORT="22"
SSH_USER="root"

if [[ $HOST == lima:* ]]; then
  # For Lima, extract SSH details from limactl
  SSH_INFO=$(limactl show-ssh "$LIMA_VM" 2>/dev/null | grep -o 'Port=[0-9]*' | cut -d= -f2 || echo "")
  if [ -n "$SSH_INFO" ]; then
    SSH_PORT="$SSH_INFO"
  fi
  SSH_HOST_ADDR="127.0.0.1"
  SSH_USER=$(limactl shell "$LIMA_VM" -- whoami 2>/dev/null || echo "root")
elif [[ $HOST == ssh:* ]]; then
  # For SSH, parse user@host:port format
  SSH_TARGET="${HOST#ssh:}"
  if [[ $SSH_TARGET == *@* ]]; then
    SSH_USER="${SSH_TARGET%%@*}"
    SSH_TARGET="${SSH_TARGET#*@}"
  fi
  if [[ $SSH_TARGET == *:* ]]; then
    SSH_HOST_ADDR="${SSH_TARGET%%:*}"
    SSH_PORT="${SSH_TARGET##*:}"
  else
    SSH_HOST_ADDR="$SSH_TARGET"
  fi
else
  # Local
  SSH_HOST_ADDR="localhost"
  SSH_USER=$(whoami)
fi

ENV_CONTENT="API_URL=$API_URL
API_KEY=$API_KEY
HEARTBEAT_INTERVAL_MS=$HEARTBEAT_INTERVAL
SSH_HOST=$SSH_HOST_ADDR
SSH_PORT=$SSH_PORT
SSH_USER=$SSH_USER"

# Add Lima VM name for Lima hosts (for dynamic port retrieval)
if [[ $HOST == lima:* ]]; then
  ENV_CONTENT="$ENV_CONTENT
LIMA_VM_NAME=$LIMA_VM"
fi

if [[ $HOST == lima:* ]]; then
  limactl shell "$LIMA_VM" -- sh -c "echo '$ENV_CONTENT' > $AGENT_PATH/.env"
elif [[ $HOST == ssh:* ]]; then
  echo "$ENV_CONTENT" | ssh "$SSH_HOST" "cat > $AGENT_PATH/.env"
else
  echo "$ENV_CONTENT" > "$AGENT_PATH/.env"
fi

echo "✅ Configuration created"

echo "🚀 Step 8: Starting agent..."
if [[ $HOST == lima:* ]]; then
  # Create OpenRC init script for Alpine
  limactl shell "$LIMA_VM" -- sudo tee /etc/init.d/pinacle-agent > /dev/null << 'EOF'
#!/sbin/openrc-run

name="Pinacle Server Agent"
description="Pinacle Server Agent for pod orchestration"
command="/usr/bin/node"
command_args="/usr/local/pinacle/server-agent/dist/index.js"
command_background=true
directory="/usr/local/pinacle/server-agent"
pidfile="/run/pinacle-agent.pid"
output_log="/var/log/pinacle-agent.log"
error_log="/var/log/pinacle-agent.err"

# Auto-restart configuration
respawn_delay=5
respawn_max=0
respawn_period=60

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

  echo "✅ Agent installed as OpenRC service (auto-restart enabled)"
elif [[ $HOST == ssh:* ]]; then
  # Install as systemd service on remote servers
  ssh "$SSH_HOST" "cat > /etc/systemd/system/pinacle-agent.service" << EOF
[Unit]
Description=Pinacle Server Agent
After=network.target docker.service
StartLimitIntervalSec=0

[Service]
Type=simple
User=root
WorkingDirectory=$AGENT_PATH
ExecStart=/usr/bin/node $AGENT_PATH/dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

  ssh "$SSH_HOST" systemctl daemon-reload
  ssh "$SSH_HOST" systemctl enable pinacle-agent
  ssh "$SSH_HOST" systemctl restart pinacle-agent

  echo "✅ Agent installed as systemd service (auto-restart enabled)"
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

