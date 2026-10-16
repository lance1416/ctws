ALTER TABLE "workspace_members" DROP CONSTRAINT "workspace_members_role_check";--> statement-breakpoint
ALTER TABLE "workspace_members" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "name";