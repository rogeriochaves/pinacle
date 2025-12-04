#!/bin/sh
# PostgreSQL Backup Script for Scaleway S3
# Runs daily via cron to backup the database to S3

set -e

# Source environment variables (needed when running from cron)
if [ -f /etc/environment ]; then
  . /etc/environment
fi

# Configuration from environment variables
BACKUP_BUCKET="${SNAPSHOT_S3_BUCKET:-pinacle-backups}"
BACKUP_REGION="${SNAPSHOT_S3_REGION:-fr-par}"
BACKUP_ENDPOINT="${SNAPSHOT_S3_ENDPOINT:-https://s3.${BACKUP_REGION}.scw.cloud}"

# Generate timestamp for backup file
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="pg-backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="/tmp/${BACKUP_FILE}"

echo "[pg-backup] Starting PostgreSQL backup at $(date)"

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "[pg-backup] ERROR: DATABASE_URL is not set"
  exit 1
fi

if [ -z "$SNAPSHOT_S3_ACCESS_KEY" ] || [ -z "$SNAPSHOT_S3_SECRET_KEY" ]; then
  echo "[pg-backup] ERROR: S3 credentials not set"
  exit 1
fi

# Perform the backup
echo "[pg-backup] Dumping database..."
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_PATH"

BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
echo "[pg-backup] Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Configure AWS CLI for Scaleway
export AWS_ACCESS_KEY_ID="$SNAPSHOT_S3_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$SNAPSHOT_S3_SECRET_KEY"
export AWS_DEFAULT_REGION="$BACKUP_REGION"

# Upload to S3
echo "[pg-backup] Uploading to s3://${BACKUP_BUCKET}/backups/${BACKUP_FILE}..."
aws s3 cp "$BACKUP_PATH" "s3://${BACKUP_BUCKET}/backups/${BACKUP_FILE}" \
  --endpoint-url "$BACKUP_ENDPOINT"

echo "[pg-backup] Upload complete"

# Clean up local file
rm -f "$BACKUP_PATH"

# Optional: Clean up old backups (keep last 30 days)
echo "[pg-backup] Cleaning up backups older than 30 days..."
# Calculate cutoff date (works on Alpine/BusyBox)
CUTOFF_DATE=$(date -d "@$(($(date +%s) - 30*24*60*60))" +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)
aws s3 ls "s3://${BACKUP_BUCKET}/backups/" --endpoint-url "$BACKUP_ENDPOINT" 2>/dev/null | while read -r line; do
  FILE_NAME=$(echo "$line" | awk '{print $4}')
  if [ -z "$FILE_NAME" ]; then
    continue
  fi
  FILE_DATE=$(echo "$FILE_NAME" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
  if [ -n "$FILE_DATE" ] && [ "$FILE_DATE" \< "$CUTOFF_DATE" ]; then
    echo "[pg-backup] Deleting old backup: $FILE_NAME"
    aws s3 rm "s3://${BACKUP_BUCKET}/backups/${FILE_NAME}" --endpoint-url "$BACKUP_ENDPOINT"
  fi
done

echo "[pg-backup] Backup completed successfully at $(date)"

