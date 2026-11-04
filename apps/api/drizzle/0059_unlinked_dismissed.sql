CREATE TABLE "unlinked_dismissed" (
	"workspace_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"excerpt" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "unlinked_dismissed_target_type_target_id_source_type_source_id_excerpt_pk" PRIMARY KEY("target_type","target_id","source_type","source_id","excerpt")
);
--> statement-breakpoint
ALTER TABLE "unlinked_dismissed" ADD CONSTRAINT "unlinked_dismissed_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;