CREATE TABLE "checkout_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_session_id" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"form_data" text NOT NULL,
	"tier" varchar(50) NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"last_email_sent_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_session_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
ALTER TABLE "checkout_session" ADD CONSTRAINT "checkout_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_session_user_id_created_at_idx" ON "checkout_session" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "checkout_session_status_emails_sent_idx" ON "checkout_session" USING btree ("status","emails_sent");--> statement-breakpoint
ALTER TABLE "pod_snapshot" DROP COLUMN "storage_mb";