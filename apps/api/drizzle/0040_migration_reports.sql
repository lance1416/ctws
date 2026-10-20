CREATE TABLE "migration_reports" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"ran_at" timestamp with time zone NOT NULL,
	"backup_ref" text NOT NULL,
	"backup_bytes" text NOT NULL,
	"counts" jsonb NOT NULL,
	"items" jsonb NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "migration_reports" ADD CONSTRAINT "migration_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;