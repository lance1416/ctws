CREATE TABLE "links" (
	"workspace_id" uuid NOT NULL,
	"from_type" text NOT NULL,
	"from_id" uuid NOT NULL,
	"to_type" text NOT NULL,
	"to_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "links_from_type_from_id_to_type_to_id_kind_pk" PRIMARY KEY("from_type","from_id","to_type","to_id","kind"),
	CONSTRAINT "links_type_check" CHECK ("links"."from_type" in ('task', 'reading', 'contact', 'meeting', 'project')),
	CONSTRAINT "links_to_type_check" CHECK ("links"."to_type" in ('task', 'reading', 'contact', 'meeting', 'project')),
	CONSTRAINT "links_kind_check" CHECK ("links"."kind" in ('belongs', 'attends', 'recommends', 'about')),
	CONSTRAINT "links_not_self" CHECK (not ("links"."from_type" = "links"."to_type" and "links"."from_id" = "links"."to_id"))
);
--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "links_from_idx" ON "links" USING btree ("workspace_id","from_type","from_id");--> statement-breakpoint
CREATE INDEX "links_to_idx" ON "links" USING btree ("workspace_id","to_type","to_id");