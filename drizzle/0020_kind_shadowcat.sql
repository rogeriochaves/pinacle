CREATE TABLE "invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"stripe_invoice_id" varchar(255) NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" varchar(255) NOT NULL,
	"stripe_subscription_id" varchar(255),
	"status" varchar(50) NOT NULL,
	"amount_due" integer NOT NULL,
	"amount_paid" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'usd' NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"hosted_invoice_url" text,
	"invoice_pdf_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_customer" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" varchar(255) NOT NULL,
	"stripe_subscription_id" varchar(255),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"default_payment_method_id" varchar(255),
	"grace_period_started_at" timestamp,
	"currency" varchar(3) DEFAULT 'usd' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_customer_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "stripe_customer_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_event" (
	"id" text PRIMARY KEY NOT NULL,
	"stripe_event_id" varchar(255) NOT NULL,
	"event_type" varchar(255) NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processing_error" text,
	"data" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	CONSTRAINT "stripe_event_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_price" (
	"id" text PRIMARY KEY NOT NULL,
	"tier_id" varchar(50) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"stripe_price_id" varchar(255) NOT NULL,
	"stripe_product_id" varchar(255) NOT NULL,
	"unit_amount_decimal" varchar(50) NOT NULL,
	"interval" varchar(50) DEFAULT 'month' NOT NULL,
	"usage_type" varchar(50) DEFAULT 'metered' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_price_stripe_price_id_unique" UNIQUE("stripe_price_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"stripe_subscription_id" varchar(255) NOT NULL,
	"stripe_customer_id" varchar(255) NOT NULL,
	"user_id" text NOT NULL,
	"status" varchar(50) NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_subscription_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "usage_record" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pod_id" text NOT NULL,
	"tier_id" varchar(50) NOT NULL,
	"record_type" varchar(50) NOT NULL,
	"quantity" real NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"reported_to_stripe" boolean DEFAULT false NOT NULL,
	"stripe_usage_record_id" varchar(255),
	"stripe_subscription_item_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_customer" ADD CONSTRAINT "stripe_customer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_subscription" ADD CONSTRAINT "stripe_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_record" ADD CONSTRAINT "usage_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_user_id_created_at_idx" ON "invoice" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "stripe_event_stripe_event_id_idx" ON "stripe_event" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX "stripe_event_event_type_idx" ON "stripe_event" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "usage_record_user_id_period_idx" ON "usage_record" USING btree ("user_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "usage_record_reported_idx" ON "usage_record" USING btree ("reported_to_stripe","created_at");