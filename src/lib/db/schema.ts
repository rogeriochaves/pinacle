import type { AdapterAccount } from "@auth/core/adapters";
import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
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
    .references(() => users.id, { onDelete: "cascade" }), // Nullable for pending invitations
  email: varchar("email", { length: 255 }), // Store email for pending invitations
  invitationToken: text("invitation_token"), // Token for pending invitations
  role: varchar("role", { length: 50 }).notNull().default("member"), // owner, admin, member
  invitedBy: text("invited_by").references(() => users.id),
  invitedAt: timestamp("invited_at", { mode: "date" }),
  joinedAt: timestamp("joined_at", { mode: "date" }),
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
  limaVmName: varchar("lima_vm_name", { length: 100 }), // If this is a Lima VM, store VM name for dynamic port retrieval

  // Hardware specs
  cpuCores: real("cpu_cores").notNull(),
  memoryMb: real("memory_mb").notNull(),
  diskGb: real("disk_gb").notNull(),

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Env Sets (reusable environment variable collections)
export const envSets = pgTable("env_set", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("env_set")),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  variables: text("variables").notNull(), // JSON string of key-value pairs
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
  githubBranch: varchar("github_branch", { length: 255 }).default(""),
  isNewProject: boolean("is_new_project").default(false),
  githubDeployKeyId: integer("github_deploy_key_id"), // GitHub deploy key ID for cleanup

  // Configuration - stores the validated PinacleConfig as JSON
  // All pod configuration (tier, services, tabs) is stored here
  config: text("config").notNull(), // JSON string of PinacleConfig (validated pinacle.yaml)

  // Environment variables - reference to env set
  envSetId: text("env_set_id").references(() => envSets.id),

  // Runtime state
  ports: text("ports"), // JSON string of actual port mappings (runtime info)
  uiState: text("ui_state"), // JSON string of UI state (terminal sessions, preferences, etc)

  // Status and metadata
  status: varchar("status", { length: 50 }).notNull().default("creating"), // creating, running, stopped, error
  lastErrorMessage: text("last_error_message"), // Last error message for provisioning
  containerId: varchar("container_id", { length: 255 }),
  internalIp: varchar("internal_ip", { length: 45 }),
  publicUrl: varchar("public_url", { length: 500 }),

  // Billing
  monthlyPrice: integer("monthly_price_cents").notNull(), // Price in cents

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  lastStartedAt: timestamp("last_started_at", { mode: "date" }),
  lastStoppedAt: timestamp("last_stopped_at", { mode: "date" }),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { mode: "date" }), // Last time we received metrics for this pod
  archivedAt: timestamp("archived_at", { mode: "date" }), // Soft delete timestamp
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
export const serverMetrics = pgTable(
  "server_metrics",
  {
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
  },
  (table) => ({
    serverIdTimestampIdx: index("server_metrics_server_id_timestamp_idx").on(
      table.serverId,
      table.timestamp,
    ),
  }),
);

// Pod metrics for per-pod resource tracking
export const podMetrics = pgTable(
  "pod_metrics",
  {
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
  },
  (table) => [
    index("pod_metrics_pod_id_timestamp_idx").on(table.podId, table.timestamp),
  ],
);

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
  exitCode: integer("exit_code"), // Exit code (0 = success) - nullable for in-progress commands
  duration: integer("duration"), // Duration in milliseconds - nullable for in-progress commands
  label: text("label"), // Optional human-readable label (e.g., "📦 Cloning repository")
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Pod snapshots for state preservation
export const podSnapshots = pgTable("pod_snapshot", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("snapshot")),
  podId: text("pod_id").notNull(), // No FK - pod may be deleted but snapshots retained
  name: varchar("name", { length: 255 }).notNull(), // User-friendly name (e.g. "auto-2024-01-15" or "before-deployment")
  description: text("description"), // Optional user description
  storagePath: varchar("storage_path", { length: 500 }).notNull(), // Path/key in storage backend
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(), // Snapshot size in bytes (convert to MB for billing: sizeBytes / 1024 / 1024)
  status: varchar("status", { length: 50 }).notNull().default("creating"), // creating, ready, failed, restoring
  isAuto: boolean("is_auto").notNull().default(false), // Auto-created on stop vs manual
  errorMessage: text("error_message"), // Error details if status is failed
  metadata: text("metadata"), // JSON string for additional metadata (container image, etc)
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { mode: "date" }), // When snapshot creation completed
});

// Pod screenshots for "jump right back" feature
export const podScreenshots = pgTable(
  "pod_screenshot",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(generateKsuidBuilder("screenshot")),
    podId: text("pod_id")
      .notNull()
      .references(() => pods.id, { onDelete: "cascade" }),
    url: text("url").notNull(), // URL of the screenshot in S3
    port: integer("port").notNull(), // The port that was being viewed
    path: text("path").notNull().default("/"), // The path that was being viewed
    sizeBytes: integer("size_bytes"), // Size in bytes
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("pod_screenshot_pod_id_idx").on(table.podId),
    index("pod_screenshot_created_at_idx").on(table.createdAt),
  ],
);

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

// Stripe customers (billing)
export const stripeCustomers = pgTable("stripe_customer", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("stripe_customer")),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 })
    .notNull()
    .unique(),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull().default("active"), // active, past_due, canceled, paused
  defaultPaymentMethodId: varchar("default_payment_method_id", { length: 255 }),
  gracePeriodStartedAt: timestamp("grace_period_started_at", { mode: "date" }),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Stripe subscriptions (detailed subscription info)
export const stripeSubscriptions = pgTable("stripe_subscription", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("stripe_subscription")),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 })
    .notNull()
    .unique(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).notNull(), // active, past_due, canceled, incomplete, paused, etc.
  currentPeriodStart: timestamp("current_period_start", {
    mode: "date",
  }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { mode: "date" }).notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  canceledAt: timestamp("canceled_at", { mode: "date" }),
  trialStart: timestamp("trial_start", { mode: "date" }),
  trialEnd: timestamp("trial_end", { mode: "date" }),
  metadata: text("metadata"), // JSON metadata from Stripe
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Stripe prices (maps resource tiers to Stripe price IDs)
export const stripePrices = pgTable("stripe_price", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(generateKsuidBuilder("stripe_price")),
  tierId: varchar("tier_id", { length: 50 }).notNull(), // dev.small, dev.medium, etc
  currency: varchar("currency", { length: 3 }).notNull(), // usd, eur, brl
  stripePriceId: varchar("stripe_price_id", { length: 255 }).notNull().unique(),
  stripeProductId: varchar("stripe_product_id", { length: 255 }).notNull(),
  unitAmountDecimal: varchar("unit_amount_decimal", { length: 50 }).notNull(), // Stripe uses string for decimal precision
  interval: varchar("interval", { length: 50 }).notNull().default("month"),
  usageType: varchar("usage_type", { length: 50 }).notNull().default("metered"), // metered or licensed
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Usage records (local tracking for billing)
export const usageRecords = pgTable(
  "usage_record",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(generateKsuidBuilder("usage_record")),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    podId: text("pod_id").notNull(), // No FK - pod may be deleted
    tierId: varchar("tier_id", { length: 50 }).notNull(),
    recordType: varchar("record_type", { length: 50 }).notNull(), // runtime or storage
    quantity: real("quantity").notNull(), // Hours or GB-hours
    periodStart: timestamp("period_start", { mode: "date" }).notNull(),
    periodEnd: timestamp("period_end", { mode: "date" }).notNull(),
    reportedToStripe: boolean("reported_to_stripe").notNull().default(false),
    stripeUsageRecordId: varchar("stripe_usage_record_id", { length: 255 }),
    stripeSubscriptionItemId: varchar("stripe_subscription_item_id", {
      length: 255,
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("usage_record_user_id_period_idx").on(
      table.userId,
      table.periodStart,
      table.periodEnd,
    ),
    index("usage_record_reported_idx").on(
      table.reportedToStripe,
      table.createdAt,
    ),
  ],
);

// Stripe webhook events (for idempotency and auditing)
export const stripeEvents = pgTable(
  "stripe_event",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(generateKsuidBuilder("stripe_event")),
    stripeEventId: varchar("stripe_event_id", { length: 255 })
      .notNull()
      .unique(),
    eventType: varchar("event_type", { length: 255 }).notNull(),
    processed: boolean("processed").notNull().default(false),
    processingError: text("processing_error"),
    data: text("data").notNull(), // JSON event data
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { mode: "date" }),
  },
  (table) => [
    index("stripe_event_stripe_event_id_idx").on(
      table.stripeEventId,
    ),
    index("stripe_event_event_type_idx").on(table.eventType),
  ],
);

// Invoices (cache Stripe invoice data)
export const invoices = pgTable(
  "invoice",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(generateKsuidBuilder("invoice")),
    stripeInvoiceId: varchar("stripe_invoice_id", { length: 255 })
      .notNull()
      .unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).notNull(),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    status: varchar("status", { length: 50 }).notNull(), // draft, open, paid, uncollectible, void
    amountDue: integer("amount_due").notNull(), // In cents
    amountPaid: integer("amount_paid").notNull().default(0), // In cents
    currency: varchar("currency", { length: 3 }).notNull().default("usd"),
    periodStart: timestamp("period_start", { mode: "date" }),
    periodEnd: timestamp("period_end", { mode: "date" }),
    hostedInvoiceUrl: text("hosted_invoice_url"),
    invoicePdfUrl: text("invoice_pdf_url"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("invoice_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

// Abandoned checkout sessions (for recovery emails)
export const checkoutSessions = pgTable(
  "checkout_session",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(generateKsuidBuilder("checkout_session")),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeSessionId: varchar("stripe_session_id", { length: 255 })
      .notNull()
      .unique(),
    status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, completed, expired, abandoned
    formData: text("form_data").notNull(), // JSON with pod configuration
    tier: varchar("tier", { length: 50 }).notNull(), // For easy querying
    emailsSent: integer("emails_sent").notNull().default(0), // Count of recovery emails sent (0, 1, 2, 3)
    lastEmailSentAt: timestamp("last_email_sent_at", { mode: "date" }),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("checkout_session_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("checkout_session_status_emails_sent_idx").on(
      table.status,
      table.emailsSent,
    ),
  ],
);

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  ownedTeams: many(teams),
  teamMemberships: many(teamMembers),
  ownedPods: many(pods),
  githubInstallations: many(userGithubInstallations),
  stripeCustomer: one(stripeCustomers, {
    fields: [users.id],
    references: [stripeCustomers.userId],
  }),
  subscriptions: many(stripeSubscriptions),
  usageRecords: many(usageRecords),
  invoices: many(invoices),
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
  screenshots: many(podScreenshots),
}));

export const podScreenshotsRelations = relations(podScreenshots, ({ one }) => ({
  pod: one(pods, {
    fields: [podScreenshots.podId],
    references: [pods.id],
  }),
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

export const stripeCustomersRelations = relations(
  stripeCustomers,
  ({ one, many }) => ({
    user: one(users, {
      fields: [stripeCustomers.userId],
      references: [users.id],
    }),
    subscriptions: many(stripeSubscriptions),
  }),
);

export const stripeSubscriptionsRelations = relations(
  stripeSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [stripeSubscriptions.userId],
      references: [users.id],
    }),
    customer: one(stripeCustomers, {
      fields: [stripeSubscriptions.stripeCustomerId],
      references: [stripeCustomers.stripeCustomerId],
    }),
  }),
);

export const usageRecordsRelations = relations(usageRecords, ({ one }) => ({
  user: one(users, {
    fields: [usageRecords.userId],
    references: [users.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  user: one(users, {
    fields: [invoices.userId],
    references: [users.id],
  }),
}));
