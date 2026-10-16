ALTER TABLE "task_events" DROP CONSTRAINT "task_events_source_check";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
ALTER TABLE "task_events" DROP CONSTRAINT "task_events_actor_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "links_from_idx";--> statement-breakpoint
UPDATE "projects" SET "color" = 'project-1' WHERE "color" IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "color" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_items" DROP COLUMN "fetched_at";--> statement-breakpoint
ALTER TABLE "task_events" DROP COLUMN "actor_user_id";--> statement-breakpoint
ALTER TABLE "task_events" DROP COLUMN "source";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "manual_progress";--> statement-breakpoint
UPDATE "users" SET "role" = 'member' WHERE "role" = 'maintainer';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'member'));