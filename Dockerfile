# syntax=docker/dockerfile:1

# ===========================
# Dependencies stage (prod only)
# ===========================
FROM node:22-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# ===========================
# Builder stage
# ===========================
FROM node:22-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy package files and source
COPY package.json pnpm-lock.yaml ./
COPY . .

# Install dev dependencies on top (reuses prod dependencies, faster)
RUN pnpm install --frozen-lockfile

# Build Next.js application
RUN pnpm build

# Compile just the entry point TypeScript files (server.ts and worker.ts)
# Using loose mode - Next.js already validated types during build
RUN pnpm exec tsc server.ts --outDir . --module commonjs --target ES2022 --esModuleInterop --skipLibCheck --resolveJsonModule --noImplicitAny false || true && \
    pnpm exec tsc src/worker.ts --outDir src --module commonjs --target ES2022 --esModuleInterop --skipLibCheck --resolveJsonModule --noImplicitAny false || true && \
    ls -la server.js src/worker.js

# ===========================
# Runner stage
# ===========================
FROM node:22-alpine AS runner
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set environment to production
ENV NODE_ENV=production

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Copy production dependencies from deps stage (already installed)
COPY --from=deps /app/node_modules ./node_modules

# Copy built Next.js application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy compiled entry points
COPY --from=builder /app/server.js ./

# Copy source files (lib, emails, types, etc. - everything except app/components which are in .next)
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/src/emails ./src/emails
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/src/worker.js ./src/
COPY --from=builder /app/src/env.ts ./src/

# Copy necessary config files
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/drizzle.config.ts ./

# Copy database migrations
COPY --from=builder /app/drizzle ./drizzle

# Copy startup script
COPY start.sh ./
RUN chmod +x start.sh

# Expose the default port
EXPOSE 3000

# Start the application
CMD ["./start.sh"]

