ALTER TABLE "pod" ADD COLUMN "github_repo" varchar(500);--> statement-breakpoint
ALTER TABLE "pod" ADD COLUMN "github_branch" varchar(255) DEFAULT 'main';--> statement-breakpoint
ALTER TABLE "pod" ADD COLUMN "is_new_project" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "pod" ADD COLUMN "tier" varchar(50) DEFAULT 'dev.small' NOT NULL;--> statement-breakpoint
ALTER TABLE "pod" ADD COLUMN "config" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "github_id" varchar(255);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "github_username" varchar(255);