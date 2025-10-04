-- Add columns as nullable first
ALTER TABLE "server" ADD COLUMN "ssh_host" varchar(255);--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "ssh_port" integer DEFAULT 22;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "ssh_user" varchar(100) DEFAULT 'root';--> statement-breakpoint

-- Update existing rows with defaults (use ip_address as ssh_host for existing servers)
UPDATE "server" SET "ssh_host" = "ip_address" WHERE "ssh_host" IS NULL;--> statement-breakpoint
UPDATE "server" SET "ssh_port" = 22 WHERE "ssh_port" IS NULL;--> statement-breakpoint
UPDATE "server" SET "ssh_user" = 'root' WHERE "ssh_user" IS NULL;--> statement-breakpoint

-- Now make them NOT NULL
ALTER TABLE "server" ALTER COLUMN "ssh_host" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ALTER COLUMN "ssh_port" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ALTER COLUMN "ssh_user" SET NOT NULL;