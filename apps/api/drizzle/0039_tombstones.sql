CREATE TABLE "tombstones" (
	"workspace_id" uuid NOT NULL,
	"object_type" text NOT NULL,
	"object_id" uuid NOT NULL,
	"title" text NOT NULL,
	"deleted_at" timestamp with time zone NOT NULL,
	"place" jsonb NOT NULL,
	CONSTRAINT "tombstones_object_type_object_id_pk" PRIMARY KEY("object_type","object_id"),
	CONSTRAINT "tombstones_type_check" CHECK ("tombstones"."object_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation', 'communication', 'note'))
);
--> statement-breakpoint
ALTER TABLE "tombstones" ADD CONSTRAINT "tombstones_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- A project's deletion unfiles what was in it: only `project_id` goes null, never the workspace
-- (a plain SET NULL on a composite key would null both). drizzle-kit cannot say this, so the
-- three constraints are rewritten by hand; they match the snapshot in every other way.
ALTER TABLE "meetings" DROP CONSTRAINT "meetings_project_fk";--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE SET NULL ("project_id");--> statement-breakpoint
ALTER TABLE "reading_items" DROP CONSTRAINT "reading_items_project_fk";--> statement-breakpoint
ALTER TABLE "reading_items" ADD CONSTRAINT "reading_items_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE SET NULL ("project_id");--> statement-breakpoint
ALTER TABLE "communications" DROP CONSTRAINT "communications_project_fk";--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE SET NULL ("project_id");
