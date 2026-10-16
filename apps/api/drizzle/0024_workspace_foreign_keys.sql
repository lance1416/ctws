ALTER TABLE "tasks" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "tasks" SET "workspace_id" = "projects"."workspace_id" FROM "projects" WHERE "projects"."id" = "tasks"."project_id";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_id_key" UNIQUE("workspace_id","id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_id_key" UNIQUE("workspace_id","id");--> statement-breakpoint
ALTER TABLE "task_dependencies" DROP CONSTRAINT "task_dependencies_blocker_id_fkey";--> statement-breakpoint
ALTER TABLE "task_dependencies" DROP CONSTRAINT "task_dependencies_blocked_id_fkey";--> statement-breakpoint
ALTER TABLE "task_events" DROP CONSTRAINT "task_events_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_parent_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_fk" FOREIGN KEY ("workspace_id","parent_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_blocker_fk" FOREIGN KEY ("workspace_id","blocker_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_blocked_fk" FOREIGN KEY ("workspace_id","blocked_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;
