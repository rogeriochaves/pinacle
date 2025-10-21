CREATE TABLE "pod_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"pod_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"storage_path" varchar(500) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"status" varchar(50) DEFAULT 'creating' NOT NULL,
	"is_auto" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
