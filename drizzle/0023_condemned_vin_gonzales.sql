ALTER TABLE "team_member" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "team_member" ALTER COLUMN "joined_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "team_member" ALTER COLUMN "joined_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "team_member" ADD COLUMN "email" varchar(255);