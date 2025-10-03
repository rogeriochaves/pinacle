CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" varchar(255) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"providerAccountId" varchar(255) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" varchar(255),
	"scope" varchar(255),
	"id_token" text,
	"session_state" varchar(255),
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "github_installation" (
	"id" text PRIMARY KEY NOT NULL,
	"installation_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"account_login" varchar(255) NOT NULL,
	"account_type" varchar(50) NOT NULL,
	"permissions" text,
	"repository_selection" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_installation_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE "pod_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"pod_id" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"cpu_usage_percent" real NOT NULL,
	"memory_usage_mb" real NOT NULL,
	"disk_usage_mb" real NOT NULL,
	"network_rx_bytes" real DEFAULT 0 NOT NULL,
	"network_tx_bytes" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"pod_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"hours_running" integer DEFAULT 0 NOT NULL,
	"cpu_usage_percent" real,
	"memory_usage_percent" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"template" text,
	"team_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"server_id" text,
	"github_repo" varchar(500),
	"github_branch" varchar(255) DEFAULT 'main',
	"is_new_project" boolean DEFAULT false,
	"tier" varchar(50) DEFAULT 'dev.small' NOT NULL,
	"cpu_cores" real DEFAULT 1 NOT NULL,
	"memory_mb" real DEFAULT 1024 NOT NULL,
	"storage_mb" real DEFAULT 10240 NOT NULL,
	"config" text,
	"ports" text,
	"env_vars" text,
	"status" varchar(50) DEFAULT 'creating' NOT NULL,
	"container_id" varchar(255),
	"internal_ip" varchar(45),
	"public_url" varchar(500),
	"monthly_price_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_started_at" timestamp,
	"last_stopped_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "server_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"cpu_usage_percent" real NOT NULL,
	"memory_usage_mb" real NOT NULL,
	"disk_usage_gb" real NOT NULL,
	"active_pods_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server" (
	"id" text PRIMARY KEY NOT NULL,
	"hostname" varchar(255) NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"status" varchar(50) DEFAULT 'online' NOT NULL,
	"last_heartbeat_at" timestamp,
	"cpu_cores" real NOT NULL,
	"memory_mb" real NOT NULL,
	"disk_gb" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "server_hostname_unique" UNIQUE("hostname")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" varchar(255) PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" varchar(50) DEFAULT 'member' NOT NULL,
	"invited_by" text,
	"invited_at" timestamp,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"owner_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_github_installation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"role" varchar(50) DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"email" varchar(255) NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	"password" text,
	"github_id" varchar(255),
	"github_username" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod_metrics" ADD CONSTRAINT "pod_metrics_pod_id_pod_id_fk" FOREIGN KEY ("pod_id") REFERENCES "public"."pod"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod_usage" ADD CONSTRAINT "pod_usage_pod_id_pod_id_fk" FOREIGN KEY ("pod_id") REFERENCES "public"."pod"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod" ADD CONSTRAINT "pod_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod" ADD CONSTRAINT "pod_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod" ADD CONSTRAINT "pod_server_id_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."server"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_metrics" ADD CONSTRAINT "server_metrics_server_id_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."server"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_github_installation" ADD CONSTRAINT "user_github_installation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_github_installation" ADD CONSTRAINT "user_github_installation_installation_id_github_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installation"("id") ON DELETE cascade ON UPDATE no action;