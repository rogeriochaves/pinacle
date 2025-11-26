ALTER TABLE "env_set" ADD COLUMN "content_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "env_set" ADD COLUMN "last_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "env_set" ADD COLUMN "last_modified_source" varchar(20) DEFAULT 'db';