CREATE TABLE "pod_screenshot" (
	"id" text PRIMARY KEY NOT NULL,
	"pod_id" text NOT NULL,
	"url" text NOT NULL,
	"port" integer NOT NULL,
	"path" text DEFAULT '/' NOT NULL,
	"size_bytes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pod_screenshot" ADD CONSTRAINT "pod_screenshot_pod_id_pod_id_fk" FOREIGN KEY ("pod_id") REFERENCES "public"."pod"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pod_screenshot_pod_id_idx" ON "pod_screenshot" USING btree ("pod_id");--> statement-breakpoint
CREATE INDEX "pod_screenshot_created_at_idx" ON "pod_screenshot" USING btree ("created_at");