CREATE TABLE "meeting_attendees" (
	"meeting_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	CONSTRAINT "meeting_attendees_meeting_id_person_id_pk" PRIMARY KEY("meeting_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "person_projects" (
	"person_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "person_projects_person_id_project_id_pk" PRIMARY KEY("person_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "join_url" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "reading_items" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "reading_items" ADD COLUMN "recommended_by" uuid;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_projects" ADD CONSTRAINT "person_projects_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_projects" ADD CONSTRAINT "person_projects_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_attendees_person_idx" ON "meeting_attendees" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "person_projects_project_idx" ON "person_projects" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_items" ADD CONSTRAINT "reading_items_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meetings_project_idx" ON "meetings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "reading_items_project_idx" ON "reading_items" USING btree ("project_id");--> statement-breakpoint
-- The edges that were fields all along become the modules' own (RFC-001 §2.4).
-- A person's projects: every `belongs` edge, as a row of the person's.
INSERT INTO "person_projects" ("person_id", "workspace_id", "project_id")
SELECT l.from_id, l.workspace_id, l.to_id
FROM "links" l
JOIN "people" p ON p.id = l.from_id
JOIN "projects" pr ON pr.id = l.to_id AND pr.workspace_id = l.workspace_id
WHERE l.from_type = 'person' AND l.to_type = 'project' AND l.kind = 'belongs'
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- A meeting's project: a meeting was filed under at most one.
UPDATE "meetings" m SET project_id = l.to_id
FROM "links" l
JOIN "projects" pr ON pr.id = l.to_id AND pr.workspace_id = l.workspace_id
WHERE l.from_type = 'meeting' AND l.from_id = m.id AND l.to_type = 'project' AND l.kind = 'belongs';--> statement-breakpoint
-- A reading item's project, the same way.
UPDATE "reading_items" r SET project_id = l.to_id
FROM "links" l
JOIN "projects" pr ON pr.id = l.to_id AND pr.workspace_id = l.workspace_id
WHERE l.from_type = 'reading' AND l.from_id = r.id AND l.to_type = 'project' AND l.kind = 'belongs';--> statement-breakpoint
-- Who is in each meeting, in the order the edges were made.
INSERT INTO "meeting_attendees" ("meeting_id", "person_id")
SELECT l.from_id, l.to_id
FROM "links" l
JOIN "meetings" m ON m.id = l.from_id
JOIN "people" p ON p.id = l.to_id
WHERE l.from_type = 'meeting' AND l.to_type = 'person' AND l.kind = 'attends'
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Who recommended an item: the field holds one person, the earliest; any other recommender
-- becomes a relation made by hand, so nothing said is lost (RFC-001 §9).
UPDATE "reading_items" r SET recommended_by = first.from_id
FROM (
  SELECT DISTINCT ON (l.to_id) l.to_id, l.from_id
  FROM "links" l
  JOIN "people" p ON p.id = l.from_id
  WHERE l.from_type = 'person' AND l.to_type = 'reading' AND l.kind = 'recommends'
  ORDER BY l.to_id, l.id
) first
WHERE first.to_id = r.id;--> statement-breakpoint
INSERT INTO "relations" ("id", "workspace_id", "from_type", "from_id", "to_type", "to_id", "origin", "note", "excerpt", "created_at")
SELECT l.id, l.workspace_id, 'person', l.from_id, 'reading', l.to_id, 'manual', 'Also recommended it', NULL, l.created_at
FROM "links" l
JOIN "reading_items" r ON r.id = l.to_id
WHERE l.from_type = 'person' AND l.to_type = 'reading' AND l.kind = 'recommends'
  AND r.recommended_by IS DISTINCT FROM l.from_id
ON CONFLICT DO NOTHING;
