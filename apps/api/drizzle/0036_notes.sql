CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"anchor_type" text,
	"anchor_id" uuid,
	"occurrence_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_anchor_type_check" CHECK ("notes"."anchor_type" in ('meeting', 'project', 'person', 'organisation')),
	CONSTRAINT "notes_anchor_shape" CHECK (("notes"."anchor_type" is null and "notes"."anchor_id" is null and "notes"."occurrence_id" is null)
          or ("notes"."anchor_type" is not null and "notes"."anchor_id" is not null
              and ("notes"."occurrence_id" is null or "notes"."anchor_type" = 'meeting')))
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_object_type_check";--> statement-breakpoint
ALTER TABLE "links" DROP CONSTRAINT "links_type_check";--> statement-breakpoint
ALTER TABLE "links" DROP CONSTRAINT "links_to_type_check";--> statement-breakpoint
ALTER TABLE "relations" DROP CONSTRAINT "relations_from_type_check";--> statement-breakpoint
ALTER TABLE "relations" DROP CONSTRAINT "relations_to_type_check";--> statement-breakpoint
ALTER TABLE "resources" DROP CONSTRAINT "resources_owner_type_check";--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_workspace_updated_idx" ON "notes" USING btree ("workspace_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notes_anchor_idx" ON "notes" USING btree ("workspace_id","anchor_type","anchor_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_object_type_check" CHECK ("events"."object_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation', 'communication', 'note'));--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_type_check" CHECK ("links"."from_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation', 'communication', 'note'));--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_to_type_check" CHECK ("links"."to_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation', 'communication', 'note'));--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_from_type_check" CHECK ("relations"."from_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation', 'communication', 'note'));--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_to_type_check" CHECK ("relations"."to_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation', 'communication', 'note'));--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_owner_type_check" CHECK ("resources"."owner_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation', 'communication', 'note'));