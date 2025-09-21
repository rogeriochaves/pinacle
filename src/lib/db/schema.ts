import type { AdapterAccount } from "@auth/core/adapters";
import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Users table
export const users = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  password: text("password"),
  githubId: varchar("github_id", { length: 255 }),
  githubUsername: varchar("github_username", { length: 255 }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// NextAuth tables
export const accounts = pgTable(
  "account",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 255 })
      .$type<AdapterAccount["type"]>()
      .notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("providerAccountId", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  }),
);

export const sessions = pgTable("session", {
  sessionToken: varchar("sessionToken", { length: 255 }).notNull().primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

// Teams table
export const teams = pgTable("team", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Team members table
export const teamMembers = pgTable("team_member", {
  id: uuid("id").defaultRandom().primaryKey(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 50 }).notNull().default("member"), // owner, admin, member
  invitedBy: uuid("invited_by").references(() => users.id),
  invitedAt: timestamp("invited_at", { mode: "date" }),
  joinedAt: timestamp("joined_at", { mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Pod/Machine templates
export const podTemplates = pgTable("pod_template", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  image: text("image"), // Docker image or base template
  defaultPorts: text("default_ports"), // JSON string of port mappings
  defaultEnv: text("default_env"), // JSON string of environment variables
  category: varchar("category", { length: 100 }).notNull(), // nextjs, mastra, custom, etc.
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Pod instances (the actual VMs/containers)
export const pods = pgTable("pod", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  description: text("description"),
  templateId: uuid("template_id").references(() => podTemplates.id),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // GitHub repository information
  githubRepo: varchar("github_repo", { length: 500 }), // owner/repo format
  githubBranch: varchar("github_branch", { length: 255 }).default("main"),
  isNewProject: boolean("is_new_project").default(false),

  // Resource specifications
  tier: varchar("tier", { length: 50 }).notNull().default("dev.small"), // dev.small, dev.medium, etc.
  cpuCores: integer("cpu_cores").notNull().default(1),
  memoryMb: integer("memory_mb").notNull().default(1024),
  storageMb: integer("storage_mb").notNull().default(10240), // 10GB default

  // Configuration
  config: text("config"), // JSON string of pinacle.yaml config
  ports: text("ports"), // JSON string of port mappings
  envVars: text("env_vars"), // JSON string of environment variables

  // Status and metadata
  status: varchar("status", { length: 50 }).notNull().default("creating"), // creating, running, stopped, error
  containerId: varchar("container_id", { length: 255 }),
  internalIp: varchar("internal_ip", { length: 45 }),
  publicUrl: varchar("public_url", { length: 500 }),

  // Billing
  monthlyPrice: integer("monthly_price_cents").notNull(), // Price in cents

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  lastStartedAt: timestamp("last_started_at", { mode: "date" }),
  lastStoppedAt: timestamp("last_stopped_at", { mode: "date" }),
});

// Pod usage logs for billing
export const podUsage = pgTable("pod_usage", {
  id: uuid("id").defaultRandom().primaryKey(),
  podId: uuid("pod_id")
    .notNull()
    .references(() => pods.id, { onDelete: "cascade" }),
  date: timestamp("date", { mode: "date" }).notNull(),
  hoursRunning: integer("hours_running").notNull().default(0),
  cpuUsagePercent: integer("cpu_usage_percent"),
  memoryUsagePercent: integer("memory_usage_percent"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// GitHub App installations
export const githubInstallations = pgTable("github_installation", {
  id: uuid("id").defaultRandom().primaryKey(),
  installationId: integer("installation_id").notNull().unique(),
  accountId: integer("account_id").notNull(),
  accountLogin: varchar("account_login", { length: 255 }).notNull(),
  accountType: varchar("account_type", { length: 50 }).notNull(), // "User" or "Organization"
  permissions: text("permissions"), // JSON string of permissions
  repositorySelection: varchar("repository_selection", { length: 50 }), // "all" or "selected"
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// User access to GitHub installations
export const userGithubInstallations = pgTable("user_github_installation", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  installationId: uuid("installation_id")
    .notNull()
    .references(() => githubInstallations.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 50 }).notNull().default("member"), // "admin", "member"
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  ownedTeams: many(teams),
  teamMemberships: many(teamMembers),
  ownedPods: many(pods),
  githubInstallations: many(userGithubInstallations),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  owner: one(users, {
    fields: [teams.ownerId],
    references: [users.id],
  }),
  members: many(teamMembers),
  pods: many(pods),
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
  inviter: one(users, {
    fields: [teamMembers.invitedBy],
    references: [users.id],
  }),
}));

export const podTemplatesRelations = relations(podTemplates, ({ many }) => ({
  pods: many(pods),
}));

export const podsRelations = relations(pods, ({ one, many }) => ({
  template: one(podTemplates, {
    fields: [pods.templateId],
    references: [podTemplates.id],
  }),
  team: one(teams, {
    fields: [pods.teamId],
    references: [teams.id],
  }),
  owner: one(users, {
    fields: [pods.ownerId],
    references: [users.id],
  }),
  usage: many(podUsage),
}));

export const podUsageRelations = relations(podUsage, ({ one }) => ({
  pod: one(pods, {
    fields: [podUsage.podId],
    references: [pods.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const githubInstallationsRelations = relations(githubInstallations, ({ many }) => ({
  userAccess: many(userGithubInstallations),
}));

export const userGithubInstallationsRelations = relations(userGithubInstallations, ({ one }) => ({
  user: one(users, {
    fields: [userGithubInstallations.userId],
    references: [users.id],
  }),
  installation: one(githubInstallations, {
    fields: [userGithubInstallations.installationId],
    references: [githubInstallations.id],
  }),
}));
