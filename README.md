# Pinacle

Pinacle delivers long-running AI development pods powered by gVisor-backed sandboxes. Each pod ships with Claude Code, Vibe Kanban, and Code Server pre-installed so your coding agents can keep working even when you close your laptop.

## Stack

- **Next.js 15** with the App Router, React Server Components, and Turbopack dev server
- **TypeScript** + **Tailwind CSS** (shadcn/ui components)
- **Drizzle ORM** with PostgreSQL and drizzle-kit migrations
- **tRPC v11** for typesafe API routes paired with TanStack Query on the client
- **NextAuth.js** for GitHub OAuth and credentials-based authentication
- **next-themes** for light/dark support

## Getting started

```bash
pnpm install
pnpm dev
```

The first install requires network access to npm. If the sandbox blocks outbound requests you will need to run the command locally.

### Environment variables

Create a `.env.local` file in the project root and supply at least:

```
DATABASE_URL=postgres://user:password@host:5432/pinacle
NEXTAUTH_SECRET=generate-a-long-random-string
NEXTAUTH_URL=http://localhost:3000
GITHUB_CLIENT_ID=your-client-id # optional, enables GitHub Sign-in
GITHUB_CLIENT_SECRET=your-client-secret # optional
```

> `DATABASE_URL` and `NEXTAUTH_SECRET` are required for local development. The GitHub credentials are optional until you configure OAuth.

### Database migrations

Generate migrations after editing `src/server/db/schema.ts`:

```bash
pnpm db:generate
```

Apply migrations (the command targets the database pointed to by `DATABASE_URL`):

```bash
pnpm db:migrate
```

Drizzle outputs SQL into the `drizzle/` folder which can be checked into source control.

### Development scripts

- `pnpm dev` – start the Next.js dev server on [http://localhost:3000](http://localhost:3000)
- `pnpm build` – create a production build
- `pnpm start` – run the production server
- `pnpm lint` – run Biome format & lint checks

## Feature map

- Landing page that explains Pinacle pods, pricing tiers, and the always-on AI workflow.
- Auth pages (`/signin`, `/signup`) supporting credential sign-in today and GitHub OAuth once keys are provided.
- Authenticated dashboard at `/dashboard` with a team switcher stub, pod list, and placeholders for provisioning and invites.
- tRPC router for fetching teams, members, and pods; ready to expand for mutations when the provisioning backend is wired in.
- Skeleton pages for invitations, new team wizard, pod provisioning, and settings with clear “coming soon” messaging.

## Next steps

1. **Hook up gVisor provisioning** – implement the `/pods/new` form to call your control plane and persist machine records through tRPC mutations.
2. **Team invitations** – create email/token flows using the `team_invite` table and expose actions through tRPC and the UI.
3. **Billing integration** – connect Stripe or Paddle, enforce plan limits (pods per team, CPU/RAM ceilings), and surface plan status in the dashboard.
4. **Secrets manager** – add CRUD screens for API keys / environment variables per pod with encrypted storage.
5. **Monitoring** – stream pod metrics into the dashboard (CPU, RAM, status heartbeats) via WebSockets or polling routes.

## Testing

- Run `pnpm lint` for syntax and formatting.
- Once migrations exist, add integration tests around auth & tRPC via your preferred runner (Vitest/Jest).
- Add end-to-end coverage with Playwright after the provisioning flow is wired up.

## Notes

- Several linked pages (`/pods/new`, `/teams/invite`, etc.) are intentional placeholders so navigation remains coherent while backend services are still under construction.
- The project currently expects an accessible PostgreSQL instance. Local development pairs well with Dockerized Postgres.
- Node modules were not reinstalled in this environment because outbound network calls are blocked; run `pnpm install` locally to refresh the lockfile and dependencies.
