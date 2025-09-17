import Link from "next/link";

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
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
  machineSpecs,
  machines,
  teamMembers,
  teams,
} from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { AlertCircle, ArrowRight, Cpu, Gauge, ServerCog } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  if (!session.user.defaultTeamId) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Finish setting up your first team</CardTitle>
          <CardDescription>
            We created a starter workspace for you. Choose a plan and invite collaborators to
            unlock more pods.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link href="/teams/new">Go to team setup</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const [team] = await db
    .select({
      id: teams.id,
      name: teams.name,
      plan: teams.plan,
      totalMembers: sql<number>`count(${teamMembers.id})`.mapWith(Number),
    })
    .from(teams)
    .leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
    .where(eq(teams.id, session.user.defaultTeamId))
    .groupBy(teams.id);

  const pods = await db
    .select({
      id: machines.id,
      name: machines.name,
      status: machines.status,
      template: machines.template,
      createdAt: machines.createdAt,
      spec: {
        id: machineSpecs.id,
        name: machineSpecs.name,
        cpuCores: machineSpecs.cpuCores,
        memoryGb: machineSpecs.memoryGb,
        priceMonthly: machineSpecs.priceMonthly,
      },
    })
    .from(machines)
    .leftJoin(machineSpecs, eq(machineSpecs.id, machines.specId))
    .where(eq(machines.teamId, session.user.defaultTeamId))
    .orderBy(machines.createdAt);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Badge variant="secondary" className="mb-2">
            {team?.plan ?? "starter"} plan
          </Badge>
          <h1 className="text-3xl font-semibold">{team?.name ?? "Your team"}</h1>
          <p className="text-muted-foreground">
            Manage your AI pods, monitor resource usage, and invite collaborators.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/teams/invite">Invite teammate</Link>
          </Button>
          <Button asChild>
            <Link href="/pods/new">
              Provision new pod
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {pods.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <AlertCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">No pods yet</CardTitle>
              <CardDescription>
                Spin up your first Pinacle pod to start shipping with your coding agents.
              </CardDescription>
            </div>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/pods/new">Launch a pod</Link>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {pods.map((pod) => (
            <Card key={pod.id} className="flex h-full flex-col border-border/70">
              <CardHeader className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{pod.template}</span>
                  <span className="font-medium capitalize">{pod.status}</span>
                </div>
                <CardTitle className="text-2xl font-semibold">{pod.name}</CardTitle>
                <CardDescription>
                  {pod.spec?.name ?? "Custom spec"} · {pod.spec?.cpuCores ?? "-"} vCPU · {" "}
                  {pod.spec?.memoryGb ?? "-"} GB RAM
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" />
                  Status checks are streamed every 30 seconds.
                </div>
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  Agents currently using {pod.spec?.cpuCores ?? "-"} dedicated cores.
                </div>
                <div className="flex items-center gap-2">
                  <ServerCog className="h-4 w-4 text-primary" />
                  Last heartbeat: {pod.createdAt.toLocaleString()}
                </div>
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/pods/${pod.id}`}>Open pod console</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
