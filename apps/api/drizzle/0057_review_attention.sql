CREATE TABLE "project_lines" (
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"week" date NOT NULL,
	"line" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "project_lines_project_id_week_pk" PRIMARY KEY("project_id","week")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "kept_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_lines" ADD CONSTRAINT "project_lines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_lines" ADD CONSTRAINT "project_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;