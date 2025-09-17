import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { teamMembers, teams } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin");
  }

  const memberships = await db
    .select({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
      plan: teams.plan,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, session.user.id));
  const defaultTeamId = session.user.defaultTeamId ?? memberships[0]?.id ?? null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border/60">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-lg font-semibold">
              Pinacle
            </Link>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {memberships.map((team) => (
                <Button
                  key={team.id}
                  size="sm"
                  variant={team.id === defaultTeamId ? "default" : "outline"}
                  className="capitalize"
                >
                  {team.name}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/settings" className="text-muted-foreground hover:text-foreground">
              Settings
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 bg-muted/10">
        <div className="container py-10">{children}</div>
      </main>
    </div>
  );
}
