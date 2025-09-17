import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  pgEnum,
  integer,
  numeric,
  jsonb,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const teamRoleEnum = pgEnum("team_role", ["owner", "admin", "member"]);
export const machineStatusEnum = pgEnum("machine_status", [
  "provisioning",
  "ready",
  "error",
  "suspended",
]);

export const users = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  hashedPassword: text("hashed_password"),
  defaultTeamId: uuid("default_team_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const accounts = pgTable(
  "account",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: varchar("token_type", { length: 255 }),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: varchar("session_state", { length: 255 }),
    oauthTokenSecret: text("oauth_token_secret"),
    oauthToken: text("oauth_token"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  }),
);

export const sessions = pgTable("session", {
  sessionToken: varchar("session_token", { length: 255 }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

export const teams = pgTable("team", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 160 }).notNull().unique(),
  plan: varchar("plan", { length: 60 }).default("starter").notNull(),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const teamMembers = pgTable(
  "team_member",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamRoleEnum("role").default("member").notNull(),
    invitedById: uuid("invited_by_id").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (member) => ({
    teamMemberUnique: uniqueIndex("team_member_unique")
      .on(member.teamId, member.userId),
  }),
);

export const machineSpecs = pgTable("machine_spec", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  cpuCores: integer("cpu_cores").notNull(),
  memoryGb: integer("memory_gb").notNull(),
  storageGb: integer("storage_gb").notNull(),
  priceMonthly: numeric("price_monthly", { precision: 8, scale: 2 }).notNull(),
  stacks: jsonb("stacks")
    .$type<string[]>()
    .default(sql`'[]'::jsonb`)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const machines = pgTable("machine", {
  id: uuid("id").defaultRandom().primaryKey(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  specId: varchar("spec_id", { length: 64 })
    .notNull()
    .references(() => machineSpecs.id, { onDelete: "restrict" }),
  template: varchar("template", { length: 80 }).default("custom").notNull(),
  status: machineStatusEnum("status").default("provisioning").notNull(),
  endpointUrl: text("endpoint_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
});

export const teamInvites = pgTable(
  "team_invite",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: teamRoleEnum("role").default("member").notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (invite) => ({
    inviteEmailUnique: uniqueIndex("team_invite_email_unique").on(
      invite.teamId,
      invite.email,
    ),
  }),
);

export const teamsRelations = relations(teams, ({ many, one }) => ({
  members: many(teamMembers),
  machines: many(machines),
  invites: many(teamInvites),
  createdBy: one(users, {
    fields: [teams.createdById],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  memberships: many(teamMembers),
}));

export const machineSpecsRelations = relations(machineSpecs, ({ many }) => ({
  machines: many(machines),
}));

export const machinesRelations = relations(machines, ({ one }) => ({
  team: one(teams, {
    fields: [machines.teamId],
    references: [teams.id],
  }),
  spec: one(machineSpecs, {
    fields: [machines.specId],
    references: [machineSpecs.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}));
