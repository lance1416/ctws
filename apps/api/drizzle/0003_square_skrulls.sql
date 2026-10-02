ALTER TABLE "projects" ADD COLUMN "is_inbox" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Exactly one inbox per workspace, enforced by the database rather than by the app remembering.
CREATE UNIQUE INDEX "projects_one_inbox_per_workspace" ON "projects" ("workspace_id") WHERE "is_inbox";
--> statement-breakpoint
-- Backfill: workspaces created before this column have no inbox, and their first quick capture
-- would fail. Idempotent via NOT EXISTS so a re-run cannot create a second one.
-- gen_random_uuid() yields UUIDv4, unlike the app's UUIDv7 entity ids. Deliberate: SQL cannot reach
-- the app's v7 generator, and a backfilled inbox's id carries no time meaning.
insert into projects (id, workspace_id, name, rank, is_inbox)
select gen_random_uuid(), w.id, 'Inbox', 'a0', true
from workspaces w
where not exists (select 1 from projects p where p.workspace_id = w.id and p.is_inbox);
