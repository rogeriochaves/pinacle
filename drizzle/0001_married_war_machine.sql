ALTER TABLE "pod_metrics" DROP CONSTRAINT "pod_metrics_pod_id_pod_id_fk";
--> statement-breakpoint
ALTER TABLE "pod_usage" DROP CONSTRAINT "pod_usage_pod_id_pod_id_fk";
--> statement-breakpoint
ALTER TABLE "server_metrics" DROP CONSTRAINT "server_metrics_server_id_server_id_fk";
--> statement-breakpoint
ALTER TABLE "user_github_installation" DROP CONSTRAINT "user_github_installation_installation_id_github_installation_id_fk";
