CREATE TABLE "relations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"from_type" text NOT NULL,
	"from_id" uuid NOT NULL,
	"to_type" text NOT NULL,
	"to_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"note" text,
	"field" text,
	"excerpt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relations_from_type_check" CHECK ("relations"."from_type" in ('task', 'reading', 'person', 'meeting', 'project')),
	CONSTRAINT "relations_to_type_check" CHECK ("relations"."to_type" in ('task', 'reading', 'person', 'meeting', 'project')),
	CONSTRAINT "relations_origin_check" CHECK ("relations"."origin" in ('manual', 'mention')),
	CONSTRAINT "relations_not_self" CHECK (not ("relations"."from_type" = "relations"."to_type" and "relations"."from_id" = "relations"."to_id")),
	CONSTRAINT "relations_origin_shape" CHECK (("relations"."origin" = 'mention' and "relations"."field" is not null and "relations"."excerpt" is not null)
          or ("relations"."origin" = 'manual' and "relations"."field" is null and "relations"."excerpt" is null))
);
--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "relations_edge_key" ON "relations" USING btree ("from_type","from_id","to_type","to_id","origin",coalesce("excerpt", ''));--> statement-breakpoint
CREATE INDEX "relations_to_idx" ON "relations" USING btree ("workspace_id","to_type","to_id");--> statement-breakpoint
CREATE INDEX "relations_from_idx" ON "relations" USING btree ("workspace_id","from_type","from_id");--> statement-breakpoint
-- Every `about` link becomes a relation made by hand, with no note and its own date (FR-094); the
-- edges with a fixed meaning (belongs, attends, recommends) move to their fields in later steps.
INSERT INTO "relations" ("id", "workspace_id", "from_type", "from_id", "to_type", "to_id", "origin", "created_at")
SELECT "id", "workspace_id", "from_type", "from_id", "to_type", "to_id", 'manual', "created_at"
FROM "links" WHERE "kind" = 'about';--> statement-breakpoint
DELETE FROM "links" WHERE "kind" = 'about';
