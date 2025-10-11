ALTER TABLE "pod" ALTER COLUMN "config" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "lima_vm_name" varchar(100);--> statement-breakpoint
ALTER TABLE "pod" DROP COLUMN "tier";--> statement-breakpoint
ALTER TABLE "pod" DROP COLUMN "cpu_cores";--> statement-breakpoint
ALTER TABLE "pod" DROP COLUMN "memory_mb";--> statement-breakpoint
ALTER TABLE "pod" DROP COLUMN "storage_mb";