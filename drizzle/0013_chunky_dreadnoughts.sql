ALTER TABLE "pod_logs" ALTER COLUMN "exit_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pod_logs" ALTER COLUMN "duration" DROP NOT NULL;