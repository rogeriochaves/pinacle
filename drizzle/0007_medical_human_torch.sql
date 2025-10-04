ALTER TABLE "pod_logs" ADD COLUMN "command" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pod_logs" ADD COLUMN "stdout" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "pod_logs" ADD COLUMN "stderr" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "pod_logs" ADD COLUMN "exit_code" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "pod_logs" ADD COLUMN "duration" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "pod_logs" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "pod_logs" DROP COLUMN "level";--> statement-breakpoint
ALTER TABLE "pod_logs" DROP COLUMN "message";--> statement-breakpoint
ALTER TABLE "pod_logs" DROP COLUMN "metadata";