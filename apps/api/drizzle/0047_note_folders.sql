CREATE TABLE "note_folders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "note_folders" ADD CONSTRAINT "note_folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "note_folders_workspace_name_key" ON "note_folders" USING btree ("workspace_id","name");--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_folder_id_note_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."note_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_folder_idx" ON "notes" USING btree ("folder_id");--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_shelved_on_its_own" CHECK ("notes"."anchor_type" is null or ("notes"."folder_id" is null and "notes"."pinned_at" is null));