CREATE TABLE "communication_parties" (
	"communication_id" uuid NOT NULL,
	"party_type" text NOT NULL,
	"party_id" uuid NOT NULL,
	CONSTRAINT "communication_parties_communication_id_party_type_party_id_pk" PRIMARY KEY("communication_id","party_type","party_id"),
	CONSTRAINT "communication_parties_type_check" CHECK ("communication_parties"."party_type" in ('person', 'organisation'))
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"channel" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"subject" text,
	"body" text,
	"project_id" uuid,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"awaiting_reply" boolean DEFAULT false NOT NULL,
	"follow_up_on" date,
	"replied_by" uuid,
	"reply_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communications_direction_check" CHECK ("communications"."direction" in ('sent', 'received')),
	CONSTRAINT "communications_channel_check" CHECK ("communications"."channel" in ('email', 'call', 'message', 'in_person', 'other')),
	CONSTRAINT "communications_awaiting_check" CHECK (not "communications"."awaiting_reply" or "communications"."direction" = 'sent')
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_object_type_check";--> statement-breakpoint
ALTER TABLE "links" DROP CONSTRAINT "links_type_check";--> statement-breakpoint
ALTER TABLE "links" DROP CONSTRAINT "links_to_type_check";--> statement-breakpoint
ALTER TABLE "relations" DROP CONSTRAINT "relations_from_type_check";--> statement-breakpoint
ALTER TABLE "relations" DROP CONSTRAINT "relations_to_type_check";--> statement-breakpoint
ALTER TABLE "resources" DROP CONSTRAINT "resources_owner_type_check";--> statement-breakpoint
ALTER TABLE "communication_parties" ADD CONSTRAINT "communication_parties_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "communication_parties_party_idx" ON "communication_parties" USING btree ("party_type","party_id");--> statement-breakpoint
CREATE INDEX "communications_workspace_occurred_idx" ON "communications" USING btree ("workspace_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "communications_awaiting_idx" ON "communications" USING btree ("workspace_id","follow_up_on") WHERE "communications"."awaiting_reply" and "communications"."replied_by" is null;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_object_type_check" CHECK ("events"."object_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation', 'communication'));--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_type_check" CHECK ("links"."from_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation', 'communication'));--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_to_type_check" CHECK ("links"."to_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation', 'communication'));--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_from_type_check" CHECK ("relations"."from_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation', 'communication'));--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_to_type_check" CHECK ("relations"."to_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation', 'communication'));--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_owner_type_check" CHECK ("resources"."owner_type" in ('task', 'reading', 'person', 'meeting', 'project', 'organisation', 'communication'));