CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"object_type" text NOT NULL,
	"object_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "events_object_type_check" CHECK ("events"."object_type" in ('task', 'reading', 'person', 'meeting', 'project'))
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_workspace_occurred_idx" ON "events" USING btree ("workspace_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_object_occurred_idx" ON "events" USING btree ("object_type","object_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
-- Every task's history moves across unchanged (RFC-001 2.3): same ids, so the order within an
-- instant is kept, and the type says whose history each row is.
INSERT INTO "events" ("id", "workspace_id", "object_type", "object_id", "type", "payload", "occurred_at")
SELECT "id", "workspace_id", 'task', "task_id", "type", "payload", "occurred_at" FROM "task_events";
