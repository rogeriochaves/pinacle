# Pinacle - Vibe Coding VMs

Pinacle provides secure, lightweight virtual machines pre-configured with Claude Code, Vibe Kanban, and VS Code for AI-powered development. Spin up development environments that run 24/7, accessible from anywhere.

## 🚀 Features

- **Pre-configured AI Tools**: Claude Code, Vibe Kanban, and VS Code ready to use
- **Scalable Resources**: From 1GB to 16GB RAM configurations
- **Team Collaboration**: Invite team members and share development environments
- **Secure Sandboxing**: Firecracker microVMs for maximum security and isolation
- **24/7 Uptime**: Keep your AI agents working while you sleep
- **Mobile Access**: Monitor and control from your phone

## 🛠 Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **UI Components**: shadcn/ui with Radix UI primitives
- **Backend**: tRPC v11 for type-safe APIs
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: NextAuth.js with GitHub and credentials
- **Virtualization**: Firecracker microVMs with Kata Containers for secure VM isolation
- **Deployment**: Vercel (frontend), Debian bare-metal servers with Docker + Firecracker

## 📋 Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL database
- Debian bare-metal server with KVM support (for Firecracker/Kata Containers)
- Docker (for container management)
- GitHub OAuth app (optional, for GitHub sign-in)
- **Note**: Firecracker requires KVM and cannot run on macOS - use remote server for development

## 🏗 Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd pinacle
pnpm install
```

### 2. Environment Configuration

Copy the example environment file and configure your variables:

```bash
cp env.example .env.local
```

Edit `.env.local` with your configuration:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/pinacle"

# NextAuth
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"

# GitHub OAuth (Optional)
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
```

### 3. Database Setup

Create and migrate your database:

```bash
# Generate migration files
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed with initial data
pnpm db:seed
```

### 4. Server Setup (Development & Production)

Pinacle uses Firecracker microVMs which require KVM (hardware virtualization) and cannot run on macOS. For development, use a remote Debian server:

```bash
# Set up environment variables in .env.local
export DEV_SERVER_HOST="root@your-server-ip"
export SERVER_API_KEY="your-dev-api-key"
export SSH_PUBLIC_KEY="$(cat ~/.ssh/id_ed25519.pub)"

# Provision development server with Firecracker + Kata Containers
pnpm server:provision:dev

# Or for production server
pnpm server:provision
```

The provision script will:
- Install Docker, Firecracker, and Kata Containers
- Configure secure container runtime
- Set up the server agent for monitoring
- Deploy with Cloudflared tunnel for local development

### 5. Development Server

Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📚 Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run linting
- `pnpm format` - Format code
- `pnpm db:generate` - Generate Drizzle migrations
- `pnpm db:migrate` - Run database migrations
- `pnpm db:push` - Push schema changes to database
- `pnpm db:studio` - Open Drizzle Studio
- `pnpm db:seed` - Seed database with initial data
- `pnpm test` - Run unit tests
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:ui` - Open Vitest UI
- `pnpm test:integration` - Run integration tests
- `pnpm test:pod-system` - Test pod orchestration system

## 🏗 Project Structure

```
src/
├── app/                    # Next.js app directory
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # Dashboard and management pages
│   └── api/               # API routes
├── components/            # React components
│   ├── ui/                # shadcn/ui components
│   ├── landing/           # Landing page components
│   └── dashboard/         # Dashboard components
├── lib/                   # Utility libraries
│   ├── db/                # Database configuration and schema
│   ├── trpc/              # tRPC configuration and routers
│   ├── pod-orchestration/ # Pod management system
│   └── auth.ts            # NextAuth configuration
└── env.ts                 # Environment validation
```

## 🔐 Authentication

The app supports two authentication methods:

1. **GitHub OAuth**: Sign in with your GitHub account
2. **Credentials**: Email and password registration

## 💾 Database Schema

Key entities:
- **Users**: User accounts and profiles
- **Teams**: Collaborative workspaces
- **Pods**: Virtual machine instances
- **Pod Templates**: Pre-configured environments
- **Pod Usage**: Billing and usage tracking

## 🐳 Pod Orchestration System

The pod orchestration system manages secure development VMs using Firecracker microVMs with Kata Containers.

### Development Environment

Development requires a remote Debian server with KVM support (Firecracker cannot run on macOS):

```bash
# Provision development server
pnpm server:provision:dev

# Test the pod system (requires local dev server running)
pnpm test:pod-system
```

#### Hostname-Based Port Routing

Each pod runs an internal Nginx proxy that routes requests based on the hostname:
- Pattern: `localhost-{PORT}.pod-{SLUG}.localhost:{EXPOSED_PORT}`
- Only one port (80) needs to be exposed per pod
- Services can be added dynamically without restarting the pod
- Uses `.localhost` TLD which browsers treat as localhost (no DNS/hosts setup needed)

Example:
```bash
# Access different services in the same pod (assuming exposed on port 30000)
curl http://localhost-3000-pod-test-pod.localhost:30000  # App on port 3000
curl http://localhost-8726-pod-test-pod.localhost:30000  # Code server on port 8726
curl http://localhost-5262-pod-test-pod.localhost:30000  # Vibe Kanban on port 5262
```

### Production Environment

In production, the system uses Firecracker microVMs on Debian bare-metal servers:

```bash
# Provision production server
pnpm server:provision

# The script installs:
# - Docker
# - Firecracker v1.13.1
# - Kata Containers 3.23.0
# - Configures kata-fc runtime with Firecracker hypervisor

# Verify installation
ssh root@your-server 'docker run --rm --runtime=kata-fc hello-world'
  }
}
EOF

sudo systemctl restart docker
```

### Environment Variables

The system automatically detects the environment:
- **Development**: Uses Lima VM when `NODE_ENV=development` and `platform=darwin`
- **Production**: Uses direct Docker commands on Linux

## 🚀 Deployment

### Vercel (Frontend)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main

### Database

Use a managed PostgreSQL service like:
- Neon
- PlanetScale
- Supabase
- Railway

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support, please:
1. Check the documentation
2. Search existing issues
3. Create a new issue with detailed information

---

Built with ❤️ for the AI development community.