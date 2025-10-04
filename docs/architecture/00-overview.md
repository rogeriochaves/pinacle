# Pinacle Platform Architecture

## Executive Summary

Pinacle is a cloud development environment platform that provides developers with lightweight, isolated VMs (pods) for running AI-assisted coding environments. The platform combines code editors (VS Code Server), AI assistants (Claude Code), project management tools (Vibe Kanban), and custom user applications in a unified, browser-accessible interface.

## Core Principles

1. **Simplicity First**: Build what we need now, not what we might need later
2. **Vertical Scaling**: A single server can handle thousands of users
3. **Manual Processes OK**: For rare events, manual intervention is fine
4. **Focus on Core Value**: Spinning up dev VMs quickly and reliably
5. **Stripe as Truth**: All billing and financial data lives in Stripe

## System Components

### 1. Frontend Application (Next.js)
- User authentication via GitHub OAuth
- Pod creation and configuration UI
- Tab-based interface for accessing pod services
- Simple team management
- Stripe Checkout integration

### 2. API Layer (tRPC + Next.js)
- Type-safe API endpoints
- Authentication middleware
- Simple job queue with pg-boss (PostgreSQL-based)
- Usage tracking and reporting

### 3. Pod Orchestration
- **✅ Implemented**: SSH-based unified server communication
- **✅ Implemented**: Server agent for self-registration and metrics
- **✅ Implemented**: gVisor runtime for container isolation
- **✅ Implemented**: Comprehensive provisioning logs
- Snapshot/hibernation support (TODO)
- **✅ Implemented**: Real-time resource usage tracking

### 4. Data Layer
- Single PostgreSQL instance (handles database + job queue)
- MinIO/S3 for snapshot storage
- No Redis needed - pg-boss handles queuing
- Local usage records for billing backup

### 5. Billing (Stripe)
- Usage-based billing (hourly pod runtime)
- Stripe as source of truth
- Stripe Checkout for payments
- Customer Portal for self-service

### 6. Infrastructure
- Main server (vertically scaled as needed)
- Multiple pod host machines
- Simple nginx for subdomain routing

## Key Design Decisions

1. **YAML Configuration Files**: Stored in user repositories for portability
2. **Simple SSH Keys**: Generated once per pod, deleted when pod is destroyed
3. **Subdomain-Based Routing**: `{service}-{pod}-{user}.pinacle.dev`
4. **No Complex Features**: No RBAC, no key rotation, no WebSocket features
5. **pg-boss for Jobs**: PostgreSQL-based queue instead of Redis
6. **Usage-Based Billing**: Pay for what you use, tracked hourly, billed via Stripe

## Architecture Documents

1. [System Architecture](./01-system-architecture.md) - Overall system design
2. [Pod Configuration](./02-pod-configuration.md) - YAML schema and configuration
3. [Pod Lifecycle](./03-pod-lifecycle.md) - Provisioning and management
4. [Networking](./04-networking.md) - Hostname-based routing and port management
5. [Secrets Management](./05-secrets-management.md) - Basic environment variables
6. [Template System](./06-template-system.md) - Pre-configured project templates
7. [User Experience](./07-user-experience.md) - Tab-based UI
8. [GitHub Integration](./08-github-integration.md) - OAuth and repository access
9. [Background Jobs](./09-background-jobs.md) - pg-boss job system
10. [Local Development](./10-local-development.md) - Lima VM-based dev environment
11. [Snapshot System](./11-snapshot-system.md) - Hibernation and restore
12. [Billing System](./12-billing-system.md) - Stripe integration and usage tracking
13. [**Pod Orchestration Implementation**](./13-pod-orchestration-implementation.md) - ✅ **Implemented system details**
14. [**Server Management System**](./14-server-management-system.md) - ✅ **Implemented monitoring & orchestration**

## Pricing Model

### Usage-Based Pricing
- **dev.small** (0.5 vCPU, 1GB RAM): $0.008/hour (~$6/month if always on)
- **dev.medium** (1 vCPU, 2GB RAM): $0.017/hour (~$12/month if always on)
- **dev.large** (2 vCPU, 4GB RAM): $0.033/hour (~$24/month if always on)
- **dev.xlarge** (4 vCPU, 8GB RAM): $0.067/hour (~$48/month if always on)
- **Snapshot Storage**: $0.01/GB/month

### Billing Features
- Pay only for runtime hours
- Automatic hibernation saves money
- Free tier: 10 hours/month
- All billing through Stripe