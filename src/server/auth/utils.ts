import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { slugify } from "@/lib/utils";
import { db } from "@/server/db";
import { teamMembers, teams, users } from "@/server/db/schema";

type UserRecord = typeof users.$inferSelect;

export async function provisionDefaultTeamForUser(user: UserRecord) {
  if (user.defaultTeamId) {
    return;
  }

  const baseName = user.name ? `${user.name.split(" ")[0]} Developer Hub` : "Pinacle Team";
  const baseSlug = slugify(baseName) || `team-${user.id.slice(0, 6)}`;

  let slugCandidate = baseSlug;
  let attempt = 1;

  // Keep trying until we find a free slug. Team counts are low so this should exit quickly.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db.query.teams.findFirst({
      where: eq(teams.slug, slugCandidate),
      columns: { id: true },
    });

    if (!existing) {
      break;
    }

    slugCandidate = `${baseSlug}-${attempt}`;
    attempt += 1;
  }

  const [team] = await db
    .insert(teams)
    .values({
      id: randomUUID(),
      name: baseName,
      slug: slugCandidate,
      createdById: user.id,
    })
    .returning();

  if (!team) {
    throw new Error("Failed to create default team for user");
  }

  await db.insert(teamMembers).values({
    teamId: team.id,
    userId: user.id,
    role: "owner",
  });

  await db
    .update(users)
    .set({ defaultTeamId: team.id })
    .where(eq(users.id, user.id));
}
