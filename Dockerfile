# syntax=docker/dockerfile:1

FROM node:22-alpine
WORKDIR /app

# Install system dependencies
# - openssh: for SSH connections
# - postgresql16-client: for pg_dump backups
# - aws-cli: for S3 uploads to Scaleway
RUN apk add --no-cache openssh postgresql16-client aws-cli

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set environment to production
ENV NODE_ENV=production

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy pre-built artifacts from local build
COPY .next ./.next
COPY .git-commit-hash ./
COPY public ./public
COPY server.js ./
COPY src/worker.js ./src/
COPY docs/dist ./docs/dist
COPY content ./content

# Copy necessary config files
COPY next.config.ts ./
COPY drizzle.config.ts ./

# Copy database migrations
COPY drizzle ./drizzle

# Copy backup and entrypoint scripts
COPY scripts/pg-backup.sh /usr/local/bin/pg-backup.sh
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/pg-backup.sh /usr/local/bin/entrypoint.sh

# Create cron job for daily database backup at 3:00 AM UTC
# The cron entry runs the backup script and logs output
RUN echo "0 3 * * * /usr/local/bin/pg-backup.sh >> /var/log/pg-backup.log 2>&1" > /etc/crontabs/root

# Expose the default port
EXPOSE 4000

# Use entrypoint to set up cron environment, then start the main application
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["pnpm", "start:prod"]

