CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"url" text NOT NULL,
	"name" text,
	"rank" text COLLATE "C" NOT NULL,
	"pinned_rank" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_owner_type_check" CHECK ("resources"."owner_type" in ('task', 'reading', 'person', 'meeting', 'project')),
	CONSTRAINT "resources_pinned_check" CHECK ("resources"."pinned_rank" is null or ("resources"."owner_type" = 'project' and "resources"."pinned_rank" between 1 and 9))
);
--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resources_owner_idx" ON "resources" USING btree ("workspace_id","owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_pinned_key" ON "resources" USING btree ("owner_type","owner_id","pinned_rank") WHERE "resources"."pinned_rank" is not null;