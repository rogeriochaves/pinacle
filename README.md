# Pinacle - Vibe Coding VMs

Pinacle provides secure, lightweight virtual machines pre-configured with Claude Code, Vibe Kanban, and VS Code for AI-powered development. Spin up development environments that run 24/7, accessible from anywhere.

## 🚀 Features

- **Pre-configured AI Tools**: Claude Code, Vibe Kanban, and VS Code ready to use
- **Scalable Resources**: From 1GB to 16GB RAM configurations
- **Team Collaboration**: Invite team members and share development environments
- **Secure Sandboxing**: gVisor isolation for maximum security
- **24/7 Uptime**: Keep your AI agents working while you sleep
- **Mobile Access**: Monitor and control from your phone

## 🛠 Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **UI Components**: shadcn/ui with Radix UI primitives
- **Backend**: tRPC v11 for type-safe APIs
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: NextAuth.js with GitHub and credentials
- **Containerization**: gVisor for secure VM isolation
- **Deployment**: Vercel (frontend), Docker (backend services)

## 📋 Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL database
- Docker (for gVisor/container management)
- GitHub OAuth app (optional, for GitHub sign-in)
- **For macOS Development**: Lima VM for gVisor support

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

### 4. Lima VM Setup (macOS Development Only)

For pod orchestration development on macOS, you need Lima with gVisor support:

```bash
# Install Lima
brew install lima

# Start the gVisor-enabled Lima VM
limactl start gvisor-alpine.yaml

# Verify Lima VM is running
limactl list

# Test gVisor runtime
limactl shell gvisor-alpine sudo docker run --rm --runtime=runsc hello-world
```

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

The pod orchestration system manages secure development VMs using gVisor containers.

### Development Environment (macOS)

The system uses Lima VM for gVisor support on macOS:

```bash
# Install Lima
brew install lima

# Start gVisor-enabled Lima VM
limactl start gvisor-alpine.yaml

# Test the pod system
pnpm test:pod-system
```

### Production Environment (Linux)

In production, the system runs directly on Linux with gVisor:

```bash
# Install gVisor on Linux
curl -fsSL https://gvisor.dev/archive.key | sudo gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" | sudo tee /etc/apt/sources.list.d/gvisor.list > /dev/null
sudo apt-get update && sudo apt-get install -y runsc

# Configure Docker with gVisor
sudo tee /etc/docker/daemon.json << EOF
{
  "runtimes": {
    "runsc": {
      "path": "/usr/bin/runsc"
    }
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