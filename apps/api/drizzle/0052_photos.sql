CREATE TABLE "file_deletes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"file_id" uuid NOT NULL,
	"owner_id" uuid,
	"due_at" timestamp with time zone NOT NULL,
	CONSTRAINT "file_deletes_file_id_unique" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "avatar_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_id" uuid;--> statement-breakpoint
ALTER TABLE "file_deletes" ADD CONSTRAINT "file_deletes_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_deletes_due_idx" ON "file_deletes" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "files_workspace_idx" ON "files" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_avatar_id_files_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_id_files_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;