# Pinacle Server Agent

A standalone Node.js service that runs on compute servers to monitor and report system metrics to the main Pinacle application.

## Features

- 🔄 **Auto-registration**: Automatically registers with the main server on first startup
- 📊 **System Metrics**: Collects CPU, memory, and disk usage
- 🐳 **Per-Pod Metrics**: Tracks resource usage for each running Docker container
- 💓 **Heartbeat**: Regular health checks and status updates
- 🔒 **Secure**: API key authentication
- 💾 **Persistent**: Stores server ID locally to persist across restarts

## Installation

### On a New Server

```bash
# Clone or copy the server-agent directory
cd /opt
git clone <repo> pinacle
cd pinacle/server-agent

# Install dependencies
pnpm install

# Build
pnpm build

# Configure
cp .env.example .env
# Edit .env with your API_URL and API_KEY

# Run
node dist/index.js
```

### As a Systemd Service

Create `/etc/systemd/system/pinacle-agent.service`:

```ini
[Unit]
Description=Pinacle Server Agent
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/pinacle/server-agent
ExecStart=/usr/bin/node /opt/pinacle/server-agent/dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then enable and start:

```bash
systemctl enable pinacle-agent
systemctl start pinacle-agent
systemctl status pinacle-agent
```

## Configuration

Create a `.env` file with:

```env
# Main application API URL
API_URL=https://api.pinacle.dev

# API key for authentication (get from main server)
API_KEY=your-secret-api-key-here

# Heartbeat interval in milliseconds (default: 30000 = 30 seconds)
HEARTBEAT_INTERVAL_MS=30000
```

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode (with auto-reload)
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start
```

## Testing

### Integration Test on Lima VM

Run the integration test that deploys and tests the agent on Lima:

```bash
# From the main project root
cd server-agent
tsx test-agent-lima.ts
```

This will:
1. Check Lima VM is running
2. Install Node.js on Lima if needed
3. Copy the agent to Lima
4. Start the agent
5. Verify registration and metrics in the database
6. Clean up

## How It Works

1. **Startup**: Agent reads configuration and checks for existing server ID
2. **Registration**: If no server ID exists, registers with main server and saves ID locally
3. **Metrics Collection**: Every 30 seconds (configurable):
   - Collects system-wide CPU, memory, disk usage
   - Scans running Docker containers
   - Collects per-pod metrics (CPU, memory, disk, network)
4. **Reporting**: Sends heartbeat + metrics to main server via tRPC API
5. **Persistence**: Server ID is saved to `.server-config.json` for future runs

## Metrics Collected

### Server-Level
- CPU usage percentage (0-100)
- Memory usage in MB
- Disk usage in GB
- Active pods count

### Per-Pod
- Pod ID (extracted from container name)
- Container ID
- CPU usage percentage
- Memory usage in MB
- Disk usage in MB
- Network RX/TX bytes

## API Endpoints Used

- `servers.registerServer`: Register new server
- `servers.heartbeat`: Send heartbeat
- `servers.reportMetrics`: Report system and pod metrics

All endpoints require API key authentication via `x-api-key` header.

## Troubleshooting

### Agent won't start
- Check that API_URL is reachable
- Verify API_KEY matches the main server's SERVER_API_KEY
- Check logs for connection errors

### No metrics appearing
- Ensure Docker is running and accessible
- Check that the agent has permission to run `docker` commands
- Verify the main server's database is accessible

### Registration fails
- Check API_KEY is correct
- Verify network connectivity to main server
- Check main server logs for authentication errors

## License

MIT

