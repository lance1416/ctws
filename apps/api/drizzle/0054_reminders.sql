CREATE TABLE "reminders" (
	"workspace_id" uuid NOT NULL,
	"object_type" text NOT NULL,
	"object_id" uuid NOT NULL,
	"on_day" date NOT NULL,
	"why" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "reminders_object_type_object_id_pk" PRIMARY KEY("object_type","object_id"),
	CONSTRAINT "reminders_type_check" CHECK ("reminders"."object_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation', 'communication', 'note'))
);
--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_workspace_day_idx" ON "reminders" USING btree ("workspace_id","on_day");