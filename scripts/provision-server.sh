#!/bin/bash
set -e

# Pinacle Server Provisioning Script
#
# Provisions a Debian compute server with:
# - Node.js
# - Docker + Firecracker (via Kata Containers)
# - Pinacle server agent
#
# Requires: Debian-based server with KVM support (bare metal)
#
# Usage:
#   ./provision-server.sh --api-url https://api.pinacle.dev --api-key YOUR_KEY --host ssh:root@server.com
#   ./provision-server.sh --api-url http://localhost:3000 --api-key test-key --host ssh:root@157.90.177.85

API_URL=""
DEV_API_URL=""
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
    --dev-api-url)
      DEV_API_URL="$2"
      shift 2
      ;;
    --api-key)
      API_KEY="$2"
      shift 2
      ;;
    --dev-api-key)
      DEV_API_KEY="$2"
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
if [ -z "$API_URL" ] || [ -z "$HOST" ]; then
  echo "Error: --api-url and --host are required"
  echo ""
  echo "Usage:"
  echo "  $0 --api-url URL [--api-key KEY] --host ssh:user@host"
  echo ""
  echo "Example:"
  echo "  $0 --api-url http://localhost:3000 --api-key test-key --host ssh:root@157.90.177.85"
  echo ""
  echo "Dev mode (preserves existing prod key):"
  echo "  $0 --api-url https://pinacle.dev --dev-api-url https://tunnel.com --dev-api-key dev-key --host ssh:root@server"
  exit 1
fi

# API_KEY is required unless we're in dev mode (dev-api-url is set)
if [ -z "$API_KEY" ] && [ -z "$DEV_API_URL" ]; then
  echo "Error: --api-key is required (unless using --dev-api-url for dev mode)"
  exit 1
fi

# Validate SSH public key is set
if [ -z "$SSH_PUBLIC_KEY" ]; then
  echo "Error: SSH_PUBLIC_KEY environment variable is required"
  echo "       Set it with: export SSH_PUBLIC_KEY=\"\$(cat ~/.ssh/id_ed25519.pub)\""
  echo "       Or generate new keys with: ssh-keygen -t ed25519"
  exit 1
fi

# Only support SSH now (no Lima, no local)
if [[ $HOST != ssh:* ]]; then
  echo "Error: Only ssh:user@host format is supported"
  echo "       Firecracker requires KVM and cannot run on macOS"
  exit 1
fi

SSH_HOST="${HOST#ssh:}"
echo "🖥️  Provisioning remote server: $SSH_HOST"

# Helper function to run commands on target
run_remote() {
  ssh "$SSH_HOST" "$@"
}

# Verify KVM support (critical for Firecracker)
echo "🔍 Verifying KVM support..."
if ! run_remote "[ -e /dev/kvm ]"; then
  echo "❌ /dev/kvm not found. This server does NOT support hardware virtualization."
  echo "   Firecracker requires KVM. Please use a bare metal server (not a VM)."
  exit 1
fi
echo "✅ KVM support confirmed"

# Detect architecture
echo "🔍 Detecting architecture..."
ARCH=$(run_remote "uname -m")
if [[ "$ARCH" == "x86_64" ]]; then
  ARCH_NAME="amd64"
  FIRECRACKER_ARCH="x86_64"
elif [[ "$ARCH" == "aarch64" ]]; then
  ARCH_NAME="arm64"
  FIRECRACKER_ARCH="aarch64"
else
  echo "❌ Unsupported architecture: $ARCH"
  exit 1
fi
echo "✅ Detected architecture: $ARCH ($ARCH_NAME)"

echo "📦 Step 1: Installing Node.js..."
if run_remote "which node > /dev/null 2>&1"; then
  echo "✅ Node.js already installed"
else
  echo "   Installing Node.js from NodeSource..."
  run_remote "sudo apt-get update"
  run_remote "sudo apt-get install -y curl"
  run_remote "curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -"
  run_remote "sudo apt-get install -y nodejs"
  echo "✅ Node.js installed"
fi

echo "🐳 Step 2: Installing Docker..."
if run_remote "which docker > /dev/null 2>&1"; then
  echo "✅ Docker already installed"
else
  echo "   Installing Docker from official repository..."
  run_remote "sudo apt-get update"
  run_remote "sudo apt-get install -y ca-certificates curl"
  run_remote "sudo install -m 0755 -d /etc/apt/keyrings"

  # Detect if Debian or Ubuntu
  OS_ID=$(run_remote "grep ^ID= /etc/os-release | cut -d= -f2 | tr -d '\"'")
  if [[ "$OS_ID" == "ubuntu" ]]; then
    DOCKER_URL="https://download.docker.com/linux/ubuntu"
  else
    DOCKER_URL="https://download.docker.com/linux/debian"
  fi

  echo "   Detected OS: $OS_ID, using $DOCKER_URL"

  # Add Docker's official GPG key
  run_remote "sudo curl -fsSL $DOCKER_URL/gpg -o /etc/apt/keyrings/docker.asc"
  run_remote "sudo chmod a+r /etc/apt/keyrings/docker.asc"

  # Use bookworm repository (Docker 27.x) to fix Kata networking compatibility
  # Docker 28+ breaks Kata networking (https://github.com/kata-containers/kata-containers/issues/9340)
  echo "   Using bookworm repository (Docker 27.x) for Kata networking compatibility"

  # Add Docker repository (force bookworm for Debian compatibility)
  run_remote "sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: $DOCKER_URL
Suites: bookworm
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF"

  # Install Docker 27.x (latest in 27.x series for Kata networking compatibility)
  run_remote "sudo apt-get update"
  run_remote "sudo apt-get install -y docker-ce=5:27.5.1-1~debian.12~bookworm docker-ce-cli=5:27.5.1-1~debian.12~bookworm containerd.io docker-buildx-plugin docker-compose-plugin"

  # Start and enable Docker
  run_remote "sudo systemctl start docker"
  run_remote "sudo systemctl enable docker"

  echo "✅ Docker installed"
fi

echo "🔄 Pulling pinacle-base image..."
run_remote "sudo docker image pull pinacledev/pinacle-base:latest"

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
  run_remote "sudo systemctl stop docker" || true

  # Install XFS tools if not present
  run_remote "sudo apt-get install -y xfsprogs"

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

  # Configure Docker daemon for XFS quotas (will be updated with Kata config later)
  echo "   Configuring Docker daemon for XFS quotas..."
  run_remote "sudo mkdir -p /etc/docker"
  run_remote "sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  \"data-root\": \"/var/lib/docker\",
  \"storage-driver\": \"overlay2\"
}
EOF"

  # Start Docker
  run_remote "sudo systemctl start docker"

  echo "✅ XFS storage configured with quota support (${VOLUME_SIZE_GB}GB)"
fi

echo "🔥 Step 3: Installing Firecracker..."
FIRECRACKER_VERSION="v1.13.1"
FIRECRACKER_PATH="/opt/firecracker"

if run_remote "[ -f $FIRECRACKER_PATH/firecracker ]"; then
  echo "✅ Firecracker already installed"
else
  echo "   Installing Firecracker ${FIRECRACKER_VERSION}..."

  # Install dependencies
  run_remote "sudo apt-get install -y curl wget tar jq acl"

  # Create install directory
  run_remote "sudo mkdir -p $FIRECRACKER_PATH"

  # Download Firecracker release
  FIRECRACKER_TGZ="firecracker-${FIRECRACKER_VERSION}-${FIRECRACKER_ARCH}.tgz"
  FIRECRACKER_URL="https://github.com/firecracker-microvm/firecracker/releases/download/${FIRECRACKER_VERSION}/${FIRECRACKER_TGZ}"

  echo "   Downloading from: $FIRECRACKER_URL"
  run_remote "cd /tmp && curl -fSL '$FIRECRACKER_URL' -o '$FIRECRACKER_TGZ'"

  # Extract
  run_remote "cd /tmp && tar -xzf '$FIRECRACKER_TGZ'"

  # Find extracted directory and install binaries
  run_remote "cd /tmp && EXTRACTED_DIR=\$(find . -maxdepth 1 -type d -name 'release-*${FIRECRACKER_ARCH}*' | head -n 1) && \
    sudo cp \"\$EXTRACTED_DIR/firecracker-${FIRECRACKER_VERSION}-${FIRECRACKER_ARCH}\" $FIRECRACKER_PATH/firecracker && \
    sudo cp \"\$EXTRACTED_DIR/jailer-${FIRECRACKER_VERSION}-${FIRECRACKER_ARCH}\" $FIRECRACKER_PATH/jailer && \
    sudo chmod +x $FIRECRACKER_PATH/firecracker $FIRECRACKER_PATH/jailer"

  # Clean up
  run_remote "cd /tmp && rm -rf release-* '$FIRECRACKER_TGZ'"

  # Allow current user access to /dev/kvm
  run_remote "sudo setfacl -m u:\$USER:rw /dev/kvm || true"

  echo "✅ Firecracker installed"
fi

echo "📦 Step 4: Installing Kata Containers..."
KATA_VERSION="3.23.0"
KATA_INSTALL_DIR="/opt/kata"

if run_remote "[ -f /usr/bin/kata-runtime ]"; then
  echo "✅ Kata Containers already installed"
else
  echo "   Installing Kata Containers ${KATA_VERSION}..."

  # Install dependencies
  run_remote "sudo apt-get install -y curl wget zstd tar jq"

  # Download Kata static bundle
  KATA_ZST="kata-static-${KATA_VERSION}-${ARCH_NAME}.tar.zst"
  KATA_URL="https://github.com/kata-containers/kata-containers/releases/download/${KATA_VERSION}/${KATA_ZST}"

  echo "   Downloading from: $KATA_URL"
  run_remote "sudo mkdir -p $KATA_INSTALL_DIR"
  run_remote "cd /tmp && curl -fSL '$KATA_URL' -o '$KATA_ZST'"

  # Extract
  echo "   Extracting Kata bundle..."
  run_remote "cd $KATA_INSTALL_DIR && sudo tar --use-compress-program=unzstd -xvf /tmp/$KATA_ZST"

  # Move files from nested structure
  if run_remote "[ -d $KATA_INSTALL_DIR/opt/kata ]"; then
    run_remote "sudo mv $KATA_INSTALL_DIR/opt/kata/* $KATA_INSTALL_DIR/ && sudo rm -rf $KATA_INSTALL_DIR/opt"
  fi

  # Install runtime globally
  run_remote "sudo ln -sf $KATA_INSTALL_DIR/bin/kata-runtime /usr/bin/kata-runtime"
  run_remote "sudo ln -sf $KATA_INSTALL_DIR/bin/containerd-shim-kata-v2 /usr/bin/containerd-shim-kata-v2"

  # Clean up
  run_remote "rm -f /tmp/$KATA_ZST"

  echo "✅ Kata Containers installed"
  run_remote "kata-runtime --version" || true
fi

echo "⚙️  Step 5: Configuring Kata to use Firecracker..."
KATA_CONFIG="$KATA_INSTALL_DIR/share/defaults/kata-containers/configuration-fc.toml"

if ! run_remote "[ -f $KATA_CONFIG ]"; then
  echo "❌ Kata configuration file not found: $KATA_CONFIG"
  exit 1
fi

echo "   Updating Kata configuration for Firecracker..."

# Update Kata configuration to use Firecracker
run_remote "sudo sed -i 's|^path = .*|path = \"$FIRECRACKER_PATH/firecracker\"|g' $KATA_CONFIG"
run_remote "sudo sed -i 's|^kernel = .*|kernel = \"$KATA_INSTALL_DIR/share/kata-containers/vmlinux.container\"|g' $KATA_CONFIG"
run_remote "sudo sed -i 's|^initrd = .*|initrd = \"$KATA_INSTALL_DIR/share/kata-containers/kata-containers-initrd.img\"|g' $KATA_CONFIG" || true
run_remote "sudo sed -i 's|^image = .*|image = \"$KATA_INSTALL_DIR/share/kata-containers/kata-containers.img\"|g' $KATA_CONFIG" || true

# Use virtio-mmio for Firecracker compatibility
run_remote "sudo sed -i 's|block_device_driver = .*|block_device_driver = \"virtio-mmio\"|' $KATA_CONFIG"

# Disable vsock (Firecracker doesn't fully support it)
run_remote "sudo sed -i 's|enable_vsock = true|enable_vsock = false|' $KATA_CONFIG" || true

# Set kernel parameters to prevent OpenRC cgroup issues in microVMs
run_remote "sudo sed -i 's|kernel_params = .*|kernel_params = \"cgroup_no_v1=all systemd.unified_cgroup_hierarchy=1 cgroup_disable=memory\"|' $KATA_CONFIG"

echo "✅ Kata configured for Firecracker"

echo "🌐 Step 6a: Installing CNI plugins for Kata networking..."
# Install CNI plugins for Kata networking (Docker 27 + Kata compatibility)
run_remote "sudo mkdir -p /opt/cni/bin"
run_remote "cd /tmp && sudo curl -L https://github.com/containernetworking/plugins/releases/download/v1.4.0/cni-plugins-linux-amd64-v1.4.0.tgz | sudo tar -xzC /opt/cni/bin/"
echo "✅ CNI plugins installed"

echo "🔧 Step 6c: Configuring containerd for Kata runtime..."

# Generate default containerd config
run_remote "sudo mkdir -p /etc/containerd"
run_remote "containerd config default | sudo tee /etc/containerd/config.toml > /dev/null"

# Add Kata runtime to containerd config
run_remote "sudo tee -a /etc/containerd/config.toml > /dev/null <<'EOF'

[plugins.\"io.containerd.grpc.v1.cri\".containerd.runtimes.kata-fc]
  runtime_type = \"io.containerd.kata.v2\"
  privileged_without_host_devices = true
  pod_annotations = [\"io.katacontainers.*\"]
  [plugins.\"io.containerd.grpc.v1.cri\".containerd.runtimes.kata-fc.options]
    ConfigPath = \"$KATA_CONFIG\"
EOF"

echo "   Restarting containerd..."
run_remote "sudo systemctl restart containerd"

echo "✅ containerd configured with Kata runtime"

echo "🐳 Step 6d: Configuring Docker to use Kata runtime..."

# Check if kata-fc runtime is already configured
KATA_CONFIGURED=$(run_remote "grep -q 'kata-fc' /etc/docker/daemon.json 2>/dev/null && echo 'yes' || echo 'no'")

if [ "$KATA_CONFIGURED" = "yes" ]; then
  echo "   Kata runtime already configured in Docker, skipping restart"
else
  # Configure Docker to use the Kata runtime from containerd
  run_remote "sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  \"data-root\": \"/var/lib/docker\",
  \"storage-driver\": \"overlay2\",
  \"runtimes\": {
    \"kata-fc\": {
      \"runtimeType\": \"io.containerd.kata.v2\"
    }
  },
  \"default-runtime\": \"runc\"
}
EOF"

  echo "   Restarting Docker to apply configuration..."
  run_remote "sudo systemctl restart docker"
fi

echo "✅ Docker configured with kata-fc runtime"

echo "✅ Step 7: Verifying Kata + Firecracker installation..."
echo "   Testing with hello-world container..."

# Test the kata-fc runtime
if run_remote "sudo docker run --rm --runtime=kata-fc hello-world" 2>&1 | tee /tmp/kata-test.log; then
  echo "✅ Kata + Firecracker runtime verified successfully!"
else
  echo "❌ Kata + Firecracker verification FAILED!"
  echo "   This is critical - containers won't be isolated properly."
  echo ""
  echo "   Checking configuration..."
  run_remote "sudo docker info | grep -i runtime" || true
  run_remote "kata-runtime kata-check" || true
  exit 1
fi

# Test with pinacle-base image
echo "   Testing with pinacle-base image..."
if run_remote "sudo docker run --rm --runtime=kata-fc pinacledev/pinacle-base:latest echo 'Kata + Firecracker working!'" 2>&1; then
  echo "✅ pinacle-base image works with Kata + Firecracker!"
else
  echo "⚠️  Warning: pinacle-base test failed, but continuing..."
fi

# Test network connectivity in Kata container
echo "   Testing network connectivity in Kata container..."
if run_remote "sudo docker run --rm --runtime=kata-fc alpine:latest sh -c 'apk add --no-cache curl && curl -s --connect-timeout 5 https://api.github.com/zen && echo \"✅ Network connectivity verified!\"'" 2>&1; then
  echo "✅ Kata containers have internet access!"
else
  echo "❌ Kata container network connectivity FAILED!"
  echo "   This will prevent containers from accessing external resources."
  echo "   Common causes: Docker version incompatibility or missing CNI plugins."
  echo ""
  echo "   Troubleshooting:"
  echo "   - Check Docker version (should be 27.x for Kata networking)"
  echo "   - Verify CNI plugins are installed: ls -la /opt/cni/bin/"
  echo "   - Check Kata configuration: kata-runtime kata-check"
  exit 1
fi

echo "📁 Step 8: Creating agent directory and log file..."
run_remote "sudo mkdir -p '$AGENT_PATH' && sudo chown -R \$USER '$AGENT_PATH'"
run_remote "sudo mkdir -p '/var/lib/pinacle/snapshots' && sudo chown -R \$USER '/var/lib/pinacle/snapshots'"
run_remote "sudo touch /var/log/pinacle-agent.log && sudo chmod 666 /var/log/pinacle-agent.log"
echo "✅ Directory created: $AGENT_PATH"
echo "✅ Log file created: /var/log/pinacle-agent.log"

echo "📋 Step 9: Building and copying agent..."
cd "$(dirname "$0")/.."
cd server-agent

# Build agent
echo "🔨 Building agent..."
npm run build

# Copy files to server
echo "📤 Copying files..."
scp -r dist "$SSH_HOST:$AGENT_PATH/"
scp package.json "$SSH_HOST:$AGENT_PATH/"

echo "✅ Agent copied"

echo "📦 Step 10: Installing agent dependencies..."
run_remote "cd $AGENT_PATH && npm install --production"
echo "✅ Dependencies installed"

echo "🔑 Step 11: Installing SSH public key..."
run_remote "mkdir -p ~/.ssh && chmod 700 ~/.ssh"
run_remote "echo '$SSH_PUBLIC_KEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
echo "✅ SSH key installed"

echo "⚙️  Step 12: Creating agent configuration..."

# Extract SSH connection details from HOST
SSH_TARGET="${HOST#ssh:}"
SSH_USER="root"
SSH_HOST_ADDR=""
SSH_PORT="22"

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

# If DEV_API_URL is set, we're in dev mode - preserve the existing prod API_KEY on server
if [ -n "$DEV_API_URL" ]; then
  echo "   Dev mode: Preserving existing production API_KEY on server"

  # Check if .env already exists and has API_KEY
  EXISTING_API_KEY=$(ssh "$SSH_HOST" "grep '^API_KEY=' $AGENT_PATH/.env 2>/dev/null | cut -d'=' -f2" || echo "")

  if [ -n "$EXISTING_API_KEY" ]; then
    echo "   Using existing API_KEY from server for production URL"
    ENV_CONTENT="API_URL=$API_URL
API_KEY=$EXISTING_API_KEY
HEARTBEAT_INTERVAL_MS=$HEARTBEAT_INTERVAL
SSH_HOST=$SSH_HOST_ADDR
SSH_PORT=$SSH_PORT
SSH_USER=$SSH_USER
DEV_API_URL=$DEV_API_URL"
  else
    # No existing API_KEY, use the one provided (will be used as prod key)
    echo "   No existing API_KEY found, using provided key as production key"
    ENV_CONTENT="API_URL=$API_URL
API_KEY=$API_KEY
HEARTBEAT_INTERVAL_MS=$HEARTBEAT_INTERVAL
SSH_HOST=$SSH_HOST_ADDR
SSH_PORT=$SSH_PORT
SSH_USER=$SSH_USER
DEV_API_URL=$DEV_API_URL"
  fi

  # Add DEV_API_KEY if provided
  if [ -n "$DEV_API_KEY" ]; then
    ENV_CONTENT="$ENV_CONTENT
DEV_API_KEY=$DEV_API_KEY"
    echo "   Dev API key configured"
  fi
else
  # Production mode: just set API_KEY normally
  ENV_CONTENT="API_URL=$API_URL
API_KEY=$API_KEY
HEARTBEAT_INTERVAL_MS=$HEARTBEAT_INTERVAL
SSH_HOST=$SSH_HOST_ADDR
SSH_PORT=$SSH_PORT
SSH_USER=$SSH_USER"
fi

echo "$ENV_CONTENT" | ssh "$SSH_HOST" "cat > $AGENT_PATH/.env"

echo "✅ Configuration created"

echo "🚀 Step 13: Starting agent..."

# Install as systemd service
ssh "$SSH_HOST" "sudo tee /etc/systemd/system/pinacle-agent.service > /dev/null" <<EOF
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

run_remote "sudo systemctl daemon-reload"
run_remote "sudo systemctl enable pinacle-agent"
run_remote "sudo systemctl restart pinacle-agent"

echo "✅ Agent installed as systemd service (auto-restart enabled)"

echo ""
echo "✅ Server provisioned successfully!"
echo ""
echo "📊 To check agent logs:"
echo "   ssh $SSH_HOST sudo journalctl -u pinacle-agent -f"
echo ""
echo "🔍 To check Kata runtime:"
echo "   ssh $SSH_HOST kata-runtime kata-check"
echo ""
echo "🐳 To test Docker with Kata:"
echo "   ssh $SSH_HOST sudo docker run --rm --runtime=kata-fc alpine echo 'Hello from Firecracker!'"
echo ""
