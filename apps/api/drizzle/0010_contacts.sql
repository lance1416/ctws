CREATE TABLE "contact_channels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"label" text,
	"rank" integer NOT NULL,
	CONSTRAINT "contact_channels_kind_check" CHECK ("contact_channels"."kind" in ('email', 'phone', 'url'))
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"org" text,
	"note" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_channels_contact_idx" ON "contact_channels" USING btree ("contact_id","rank");--> statement-breakpoint
CREATE INDEX "contacts_workspace_name_idx" ON "contacts" USING btree ("workspace_id","name");