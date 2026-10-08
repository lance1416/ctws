-- 待读清单 -- the second module's own table. It carries `workspace_id` directly rather than
-- reaching one through a project, because a reading item need not have a project: a book you are
-- reading is not a line of work. ON DELETE SET NULL on the project, so deleting a project does
-- not silently throw a book away.
CREATE TABLE "reading_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"kind" text NOT NULL,
	"title" text,
	"url" text,
	"author" text,
	"status" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_items_kind_check" CHECK ("reading_items"."kind" in ('link', 'book')),
	CONSTRAINT "reading_items_status_check" CHECK ("reading_items"."status" in ('todo', 'reading', 'done', 'dropped')),
	CONSTRAINT "reading_items_shape_check" CHECK (("reading_items"."kind" = 'link' and "reading_items"."url" is not null and "reading_items"."author" is null)
          or ("reading_items"."kind" = 'book' and "reading_items"."url" is null and "reading_items"."title" is not null))
);
--> statement-breakpoint
ALTER TABLE "reading_items" ADD CONSTRAINT "reading_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_items" ADD CONSTRAINT "reading_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reading_items_workspace_created_idx" ON "reading_items" USING btree ("workspace_id","created_at" DESC NULLS LAST);