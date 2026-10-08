CREATE TABLE "meeting_attendees" (
	"meeting_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	CONSTRAINT "meeting_attendees_meeting_id_contact_id_pk" PRIMARY KEY("meeting_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "meeting_exceptions" (
	"meeting_id" uuid NOT NULL,
	"recurrence_id" text NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"starts_local" text,
	"duration_minutes" integer,
	CONSTRAINT "meeting_exceptions_meeting_id_recurrence_id_pk" PRIMARY KEY("meeting_id","recurrence_id"),
	CONSTRAINT "meeting_exceptions_duration_positive" CHECK ("meeting_exceptions"."duration_minutes" is null or "meeting_exceptions"."duration_minutes" > 0),
	CONSTRAINT "meeting_exceptions_cancelled_is_bare" CHECK (not "meeting_exceptions"."cancelled" or ("meeting_exceptions"."starts_local" is null and "meeting_exceptions"."duration_minutes" is null))
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"starts_local" text NOT NULL,
	"time_zone" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"rrule" text,
	"location" text,
	"note" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_duration_positive" CHECK ("meetings"."duration_minutes" > 0),
	CONSTRAINT "meetings_starts_local_shape" CHECK ("meetings"."starts_local" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$')
);
--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_exceptions" ADD CONSTRAINT "meeting_exceptions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_attendees_contact_idx" ON "meeting_attendees" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "meetings_workspace_idx" ON "meetings" USING btree ("workspace_id");