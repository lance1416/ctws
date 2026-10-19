CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"website" text,
	"city" text,
	"city_key" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisations_workspace_id_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "person_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"title" text,
	"from_month" date,
	"to_month" date,
	"rank" integer NOT NULL,
	CONSTRAINT "person_roles_span_check" CHECK ("person_roles"."from_month" is null or "person_roles"."to_month" is null or "person_roles"."from_month" <= "person_roles"."to_month")
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_object_type_check";--> statement-breakpoint
ALTER TABLE "links" DROP CONSTRAINT "links_type_check";--> statement-breakpoint
ALTER TABLE "links" DROP CONSTRAINT "links_to_type_check";--> statement-breakpoint
ALTER TABLE "relations" DROP CONSTRAINT "relations_from_type_check";--> statement-breakpoint
ALTER TABLE "relations" DROP CONSTRAINT "relations_to_type_check";--> statement-breakpoint
ALTER TABLE "resources" DROP CONSTRAINT "resources_owner_type_check";--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_organisation_fk" FOREIGN KEY ("workspace_id","organisation_id") REFERENCES "public"."organisations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organisations_workspace_name_idx" ON "organisations" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "person_roles_person_idx" ON "person_roles" USING btree ("person_id","rank");--> statement-breakpoint
CREATE INDEX "person_roles_organisation_idx" ON "person_roles" USING btree ("organisation_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_object_type_check" CHECK ("events"."object_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation'));--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_type_check" CHECK ("links"."from_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation'));--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_to_type_check" CHECK ("links"."to_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation'));--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_from_type_check" CHECK ("relations"."from_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation'));--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_to_type_check" CHECK ("relations"."to_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation'));--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_owner_type_check" CHECK ("resources"."owner_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation'));