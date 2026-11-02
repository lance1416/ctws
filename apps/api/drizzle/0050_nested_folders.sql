DROP INDEX "note_folders_workspace_name_key";--> statement-breakpoint
ALTER TABLE "note_folders" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "note_folders" ADD COLUMN "open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "note_folders" ADD CONSTRAINT "note_folders_parent_id_note_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."note_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_folders" ADD CONSTRAINT "note_folders_parent_name_key" UNIQUE NULLS NOT DISTINCT("workspace_id","parent_id","name");