-- MOVE, THEN DROP. Every edge that lived in a column or a join table becomes a row in `links`
-- BEFORE the thing holding it goes away. Dropping first would be a data loss that no later
-- migration could undo, so these four statements are the whole point of this file.

-- 待读 -> 项目
INSERT INTO "links" ("workspace_id", "from_type", "from_id", "to_type", "to_id", "kind")
SELECT "workspace_id", 'reading', "id", 'project', "project_id", 'belongs'
FROM "reading_items"
WHERE "project_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- 会议 -> 项目
INSERT INTO "links" ("workspace_id", "from_type", "from_id", "to_type", "to_id", "kind")
SELECT "workspace_id", 'meeting', "id", 'project', "project_id", 'belongs'
FROM "meetings"
WHERE "project_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- 联系人 -> 项目 (the many-to-many added in 0011)
INSERT INTO "links" ("workspace_id", "from_type", "from_id", "to_type", "to_id", "kind")
SELECT c."workspace_id", 'contact', cp."contact_id", 'project', cp."project_id", 'belongs'
FROM "contact_projects" cp
JOIN "contacts" c ON c."id" = cp."contact_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- 会议 -> 参与人
INSERT INTO "links" ("workspace_id", "from_type", "from_id", "to_type", "to_id", "kind")
SELECT m."workspace_id", 'meeting', ma."meeting_id", 'contact', ma."contact_id", 'attends'
FROM "meeting_attendees" ma
JOIN "meetings" m ON m."id" = ma."meeting_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint

ALTER TABLE "contact_projects" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meeting_attendees" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "contact_projects" CASCADE;--> statement-breakpoint
DROP TABLE "meeting_attendees" CASCADE;--> statement-breakpoint
ALTER TABLE "meetings" DROP CONSTRAINT "meetings_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "reading_items" DROP CONSTRAINT "reading_items_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "meetings" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "reading_items" DROP COLUMN "project_id";
