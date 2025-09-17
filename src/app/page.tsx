import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Clock,
  Cpu,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const bundles = [
  {
    id: "solo",
    name: "Solo Builder Pod",
    priceLabel: "$8",
    priceSuffix: "per month",
    cpu: "1 vCPU",
    memory: "1 GB RAM",
    storage: "30 GB SSD",
    stack: ["Claude Code", "Vibe Kanban", "Code Server"],
    actionLabel: "Start with Solo",
    highlight: true,
  },
  {
    id: "collab",
    name: "Team Sync Pod",
    priceLabel: "$29",
    priceSuffix: "up to 3 teammates",
    cpu: "2 vCPU",
    memory: "4 GB RAM",
    storage: "60 GB SSD",
    stack: ["Shared Kanban", "Claude Code", "Custom ingress"],
    actionLabel: "Scale collaboration",
  },
  {
    id: "agency",
    name: "Agency Playground",
    priceLabel: "$79",
    priceSuffix: "up to 8 teammates",
    cpu: "4 vCPU",
    memory: "12 GB RAM",
    storage: "150 GB SSD",
    stack: ["Multi-agent mesh", "Audit trail", "Snapshot backups"],
    actionLabel: "Talk to sales",
    comingSoon: true,
  },
];

const sellingPoints = [
  {
    icon: ShieldCheck,
    title: "Isolated & safe",
    description:
      "Pinned micro-VMs with gVisor isolation keep your code safe even when agents go rogue.",
  },
  {
    icon: Clock,
    title: "Runs 24/7",
    description:
      "Pods keep coding, syncing, and shipping after you close your laptop. Drop in from any device.",
  },
  {
    icon: Workflow,
    title: "Ready-made stacks",
    description:
      "Provision templates for Next.js, Mastra, or custom agent rigs with a single click.",
  },
  {
    icon: Boxes,
    title: "Team-ready",
    description:
      "Invite teammates to supervise, pair program, and deploy from the same workspace.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border/60">
        <div className="container flex items-center justify-between py-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            Pinacle
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/signin"
              className="text-muted-foreground transition hover:text-foreground"
            >
              Sign in
            </Link>
            <Button asChild size="sm">
              <Link href="/signup">
                Launch a pod
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="container grid gap-12 py-16 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-24">
          <div className="space-y-6">
            <Badge variant="secondary" className="text-xs uppercase tracking-wide">
              Always-on AI development pods
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
              Spin up a long-running coding VM for your agents in 60 seconds.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground md:text-xl">
              Pinacle delivers fully managed gVisor sandboxes preloaded with Claude Code,
              Vibe Kanban, and Code Server so your AI teammates can build, test, and deploy
              while you focus on strategy.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Button size="lg" className="gap-2" asChild>
                <Link href="/signup">
                  Provision your first pod
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#bundles">View pod catalog</Link>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                SOC2-ready architecture
              </div>
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                gVisor-backed isolation
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                24/7 uptime monitoring
              </div>
            </div>
          </div>

          <div className="relative isolate overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-secondary/30 p-8 shadow-xl">
            <div className="absolute left-1/2 top-6 h-32 w-32 -translate-x-1/2 rounded-full bg-primary/30 blur-3xl" />
            <div className="relative space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Active pod</span>
                <Badge variant="outline" className="bg-background/60">
                  Claude Code · Awake
                </Badge>
              </div>
              <div className="rounded-xl border border-white/10 bg-background/70 p-6 backdrop-blur">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Status</span>
                  <span className="text-emerald-400">Running</span>
                </div>
                <div className="mt-4 grid gap-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>CPU</span>
                    <span className="font-medium">38%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Memory</span>
                    <span className="font-medium">624 MB / 1 GB</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Agent tasks today</span>
                    <span className="font-medium">12 completed</span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Each pod exposes secure shell access, HTTP ingress, and a live Kanban board so
                you always know what your agents are shipping next.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-border/60 bg-muted/20 py-16 md:py-20">
          <div className="container grid gap-8 md:grid-cols-4">
            {sellingPoints.map((point) => (
              <Card key={point.title} className="border-none bg-background shadow-md shadow-black/5">
                <CardHeader className="space-y-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <point.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{point.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{point.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="bundles" className="container space-y-10 py-16 md:py-24">
          <div className="flex flex-col gap-4 text-center">
            <Badge variant="secondary" className="mx-auto w-fit text-xs uppercase">
              Pod plans
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Choose the vibe that matches your build velocity.
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              All pods come pre-configured with shell access, Git tooling, agent-ready API keys,
              and blazing-fast gVisor isolation. Bring your own Claude or OpenAI credentials.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {bundles.map((bundle) => (
              <Card
                key={bundle.id}
                className={cn(
                  "flex h-full flex-col border-border/70",
                  bundle.highlight && "border-primary/60 shadow-lg shadow-primary/20",
                )}
              >
                <CardHeader className="space-y-2">
                  <CardTitle className="flex items-center justify-between text-xl">
                    {bundle.name}
                    {bundle.comingSoon ? (
                      <Badge variant="outline" className="text-xs">
                        Coming soon
                      </Badge>
                    ) : bundle.highlight ? (
                      <Badge variant="default" className="text-xs">
                        Most popular
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <CardDescription className="flex items-baseline gap-1 text-4xl font-semibold">
                    <span>{bundle.priceLabel}</span>
                    <span className="text-sm font-medium text-muted-foreground">
                      {bundle.priceSuffix}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-6">
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center justify-between">
                      <span>CPU</span>
                      <span className="font-medium">{bundle.cpu}</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Memory</span>
                      <span className="font-medium">{bundle.memory}</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Storage</span>
                      <span className="font-medium">{bundle.storage}</span>
                    </li>
                  </ul>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Preloaded bundle
                    </p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {bundle.stack.map((item) => (
                        <li key={item} className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={bundle.highlight ? "default" : "outline"}
                    disabled={bundle.comingSoon}
                  >
                    {bundle.actionLabel}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t border-border/60 bg-muted/10 py-16 md:py-20">
          <div className="container flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold">Templates tuned for agents</h3>
              <p className="max-w-xl text-muted-foreground">
                Start from a clean Next.js repo, a Mastra AI agent kit, or wire up your own
                framework. Pinacle exposes the right ports automatically and provisions
                long-running credentials for your favorite LLMs.
              </p>
            </div>
            <div className="flex flex-col gap-3 text-sm text-muted-foreground md:text-right">
              <span>• Next.js full-stack starter with Drizzle & tRPC</span>
              <span>• Mastra agent lab with queue-backed workflows</span>
              <span>• Custom Dockerfile uploads for total control</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="container flex flex-col gap-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div>© {new Date().getFullYear()} Pinacle Labs. Build with confidence.</div>
          <div className="flex items-center gap-4">
            <Link href="/legal" className="hover:text-foreground">
              Legal
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="mailto:hello@pinacle.dev" className="hover:text-foreground">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
