import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { slugify } from "@/lib/utils";
import { provisionDefaultTeamForUser } from "@/server/auth/utils";
import { db } from "@/server/db";
import { teamMembers, teams, users } from "@/server/db/schema";

const truncateAll = async () => {
  await db.execute(sql`
    TRUNCATE TABLE
      "account",
      "session",
      "verification_token",
      "team_member",
      "team_invite",
      "machine",
      "machine_spec",
      "team",
      "user"
    RESTART IDENTITY CASCADE;
  `);
};

describe("provisionDefaultTeamForUser", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("creates a default team and membership when missing", async () => {
    const userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email: "solo@example.com",
      name: "Solo Builder",
    });

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new Error("user insert failed");

    await provisionDefaultTeamForUser(user);

    const updatedUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
    expect(updatedUser?.defaultTeamId).toBeTruthy();
    if (!updatedUser?.defaultTeamId) throw new Error("default team not set");

    const team = await db.query.teams.findFirst({
      where: eq(teams.id, updatedUser.defaultTeamId),
    });

    expect(team?.name).toBe("Solo Developer Hub");
    if (!team) throw new Error("team not created");

    const membership = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.teamId, team.id),
    });

    expect(membership?.userId).toBe(userId);
    expect(membership?.role).toBe("owner");
  });

  it("appends an increment when the slug already exists", async () => {
    const existingOwnerId = randomUUID();
    await db.insert(users).values({
      id: existingOwnerId,
      email: "owner@example.com",
      name: "Acme Founder",
    });

    const baseSlug = slugify("Acme Developer Hub");
    await db.insert(teams).values({
      id: randomUUID(),
      name: "Acme Developer Hub",
      slug: baseSlug,
      createdById: existingOwnerId,
    });

    const userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email: "agent@example.com",
      name: "Acme Builder",
    });

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new Error("user insert failed");

    await provisionDefaultTeamForUser(user);

    const createdTeam = await db.query.teams.findFirst({ where: eq(teams.createdById, userId) });

    expect(createdTeam?.slug).toBe(`${baseSlug}-1`);
  });
});
