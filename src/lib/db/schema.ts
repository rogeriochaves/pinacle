import type { AdapterAccount } from "@auth/core/adapters";
import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { generateKSUID } from "../utils";

export const generateKsuidBuilder = (resource: string) => () =>
  generateKSUID(resource);

// Users table
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("user")),
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
    userId: text("userId")
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
  userId: text("userId")
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
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("team")),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Team members table
export const teamMembers = pgTable("team_member", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("team_member")),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 50 }).notNull().default("member"), // owner, admin, member
  invitedBy: text("invited_by").references(() => users.id),
  invitedAt: timestamp("invited_at", { mode: "date" }),
  joinedAt: timestamp("joined_at", { mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Servers table (compute nodes that run pods)
export const servers = pgTable("server", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("server")),
  hostname: varchar("hostname", { length: 255 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("online"), // online, degraded, offline
  lastHeartbeatAt: timestamp("last_heartbeat_at", { mode: "date" }),

  // SSH connection details
  sshHost: varchar("ssh_host", { length: 255 }).notNull().default(""),
  sshPort: integer("ssh_port").notNull().default(22),
  sshUser: varchar("ssh_user", { length: 100 }).notNull().default("root"),

  // Hardware specs
  cpuCores: real("cpu_cores").notNull(),
  memoryMb: real("memory_mb").notNull(),
  diskGb: real("disk_gb").notNull(),

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Pod instances (the actual VMs/containers)
export const pods = pgTable("pod", {
  id: text("id").primaryKey().notNull().$defaultFn(generateKsuidBuilder("pod")),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  description: text("description"),
  template: text("template"),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Server assignment
  serverId: text("server_id").references(() => servers.id),

  // GitHub repository information
  githubRepo: varchar("github_repo", { length: 500 }), // owner/repo format
  githubBranch: varchar("github_branch", { length: 255 }).default("main"),
  isNewProject: boolean("is_new_project").default(false),

  // Resource specifications
  tier: varchar("tier", { length: 50 }).notNull().default("dev.small"), // dev.small, dev.medium, etc.
  cpuCores: real("cpu_cores").notNull().default(1),
  memoryMb: real("memory_mb").notNull().default(1024),
  storageMb: real("storage_mb").notNull().default(10240), // 10GB default

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
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("pod_usage")),
  podId: text("pod_id").notNull(),
  date: timestamp("date", { mode: "date" }).notNull(),
  hoursRunning: integer("hours_running").notNull().default(0),
  cpuUsagePercent: real("cpu_usage_percent"),
  memoryUsagePercent: real("memory_usage_percent"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Server metrics for monitoring
export const serverMetrics = pgTable("server_metrics", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("server_metrics")),
  serverId: text("server_id").notNull(),
  timestamp: timestamp("timestamp", { mode: "date" }).notNull().defaultNow(),
  cpuUsagePercent: real("cpu_usage_percent").notNull(),
  memoryUsageMb: real("memory_usage_mb").notNull(),
  diskUsageGb: real("disk_usage_gb").notNull(),
  activePodsCount: integer("active_pods_count").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Pod metrics for per-pod resource tracking
export const podMetrics = pgTable("pod_metrics", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("pod_metrics")),
  podId: text("pod_id").notNull(),
  timestamp: timestamp("timestamp", { mode: "date" }).notNull().defaultNow(),
  cpuUsagePercent: real("cpu_usage_percent").notNull(),
  memoryUsageMb: real("memory_usage_mb").notNull(),
  diskUsageMb: real("disk_usage_mb").notNull(),
  networkRxBytes: real("network_rx_bytes").notNull().default(0),
  networkTxBytes: real("network_tx_bytes").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Pod provisioning logs
export const podLogs = pgTable("pod_logs", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("pod_log")),
  podId: text("pod_id").notNull(), // No foreign key - pod may not exist yet during provisioning
  timestamp: timestamp("timestamp", { mode: "date" }).notNull().defaultNow(),
  command: text("command").notNull(), // The full command executed (with docker exec wrapper if applicable)
  containerCommand: text("container_command"), // Original command executed inside container (without docker exec wrapper)
  stdout: text("stdout").default(""), // Standard output
  stderr: text("stderr").default(""), // Standard error
  exitCode: integer("exit_code").notNull(), // Exit code (0 = success)
  duration: integer("duration").notNull(), // Duration in milliseconds
  label: text("label"), // Optional human-readable label (e.g., "📦 Cloning repository")
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// GitHub App installations
export const githubInstallations = pgTable("github_installation", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("github_installation")),
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
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("user_github_installation")),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  installationId: text("installation_id").notNull(),
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

export const podsRelations = relations(pods, ({ one, many }) => ({
  team: one(teams, {
    fields: [pods.teamId],
    references: [teams.id],
  }),
  owner: one(users, {
    fields: [pods.ownerId],
    references: [users.id],
  }),
  server: one(servers, {
    fields: [pods.serverId],
    references: [servers.id],
  }),
  usage: many(podUsage),
  metrics: many(podMetrics),
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

export const githubInstallationsRelations = relations(
  githubInstallations,
  ({ many }) => ({
    userAccess: many(userGithubInstallations),
  }),
);

export const userGithubInstallationsRelations = relations(
  userGithubInstallations,
  ({ one }) => ({
    user: one(users, {
      fields: [userGithubInstallations.userId],
      references: [users.id],
    }),
    installation: one(githubInstallations, {
      fields: [userGithubInstallations.installationId],
      references: [githubInstallations.id],
    }),
  }),
);

export const serversRelations = relations(servers, ({ many }) => ({
  pods: many(pods),
  metrics: many(serverMetrics),
}));

export const serverMetricsRelations = relations(serverMetrics, ({ one }) => ({
  server: one(servers, {
    fields: [serverMetrics.serverId],
    references: [servers.id],
  }),
}));

export const podMetricsRelations = relations(podMetrics, ({ one }) => ({
  // Note: No foreign key constraint, so this relation may not always resolve
  pod: one(pods, {
    fields: [podMetrics.podId],
    references: [pods.id],
  }),
}));

export const podLogsRelations = relations(podLogs, ({ one }) => ({
  pod: one(pods, {
    fields: [podLogs.podId],
    references: [pods.id],
  }),
}));
