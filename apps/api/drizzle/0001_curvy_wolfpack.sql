ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'maintainer', 'member'));--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_role_check" CHECK ("workspace_members"."role" in ('owner', 'member'));
--> statement-breakpoint
-- Hand-added (not derivable from schema.ts): an already-deployed instance has no admin, and
-- AUTH_REGISTRATION=closed means none could be created, so promote the earliest user.
UPDATE "users" SET "role" = 'admin' WHERE "id" = (SELECT "id" FROM "users" ORDER BY "created_at" LIMIT 1);
