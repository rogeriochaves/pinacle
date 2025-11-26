ALTER TABLE "env_set" RENAME TO "dotenv";--> statement-breakpoint
ALTER TABLE "dotenv" RENAME COLUMN "variables" TO "content";--> statement-breakpoint
ALTER TABLE "pod" RENAME COLUMN "env_set_id" TO "dotenv_id";--> statement-breakpoint
ALTER TABLE "dotenv" DROP CONSTRAINT "env_set_owner_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "dotenv" DROP CONSTRAINT "env_set_team_id_team_id_fk";
--> statement-breakpoint
ALTER TABLE "pod" DROP CONSTRAINT "pod_env_set_id_env_set_id_fk";
--> statement-breakpoint
ALTER TABLE "dotenv" ADD CONSTRAINT "dotenv_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dotenv" ADD CONSTRAINT "dotenv_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod" ADD CONSTRAINT "pod_dotenv_id_dotenv_id_fk" FOREIGN KEY ("dotenv_id") REFERENCES "public"."dotenv"("id") ON DELETE no action ON UPDATE no action;