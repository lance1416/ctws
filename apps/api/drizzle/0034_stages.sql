CREATE TABLE "project_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rank" integer NOT NULL,
	"collapsed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_stages_project_name_key" UNIQUE("project_id","name"),
	CONSTRAINT "project_stages_workspace_id_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "stage_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "stage_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_stages_project_idx" ON "project_stages" USING btree ("project_id","rank");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_stage_fk" FOREIGN KEY ("workspace_id","stage_id") REFERENCES "public"."project_stages"("workspace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_stage_idx" ON "tasks" USING btree ("stage_id");