#!/bin/sh
# Entrypoint script that sets up cron environment and starts services

# Export required environment variables for cron jobs
# This creates a file that the backup script can source
cat > /etc/environment <<EOF
DATABASE_URL="${DATABASE_URL}"
SNAPSHOT_S3_ACCESS_KEY="${SNAPSHOT_S3_ACCESS_KEY}"
SNAPSHOT_S3_SECRET_KEY="${SNAPSHOT_S3_SECRET_KEY}"
SNAPSHOT_S3_BUCKET="${SNAPSHOT_S3_BUCKET}"
SNAPSHOT_S3_REGION="${SNAPSHOT_S3_REGION}"
SNAPSHOT_S3_ENDPOINT="${SNAPSHOT_S3_ENDPOINT}"
EOF

# Start crond in the background
crond -b -l 2

echo "[entrypoint] Cron daemon started, backup scheduled for 3:00 AM UTC"

# Execute the main command (pnpm start:prod)
exec "$@"

