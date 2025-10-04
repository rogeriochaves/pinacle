CREATE TABLE "pod_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"pod_id" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"level" varchar(20) NOT NULL,
	"message" text NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pod_logs" ADD CONSTRAINT "pod_logs_pod_id_pod_id_fk" FOREIGN KEY ("pod_id") REFERENCES "public"."pod"("id") ON DELETE cascade ON UPDATE no action;