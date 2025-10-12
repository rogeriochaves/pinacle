CREATE TABLE "env_set" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"owner_id" text NOT NULL,
	"team_id" text,
	"variables" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pod" ADD COLUMN "env_set_id" text;--> statement-breakpoint
ALTER TABLE "env_set" ADD CONSTRAINT "env_set_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "env_set" ADD CONSTRAINT "env_set_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod" ADD CONSTRAINT "pod_env_set_id_env_set_id_fk" FOREIGN KEY ("env_set_id") REFERENCES "public"."env_set"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod" DROP COLUMN "env_vars";