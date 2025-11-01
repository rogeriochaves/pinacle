# syntax=docker/dockerfile:1

FROM node:22-alpine
WORKDIR /app

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
COPY public ./public
COPY server.js ./
COPY src/worker.js ./src/

# Copy necessary config files
COPY next.config.ts ./
COPY drizzle.config.ts ./

# Copy database migrations
COPY drizzle ./drizzle

# Expose the default port
EXPOSE 4000

# Start the application using concurrently (auto-restarts individual processes)
CMD ["pnpm", "start:prod"]

