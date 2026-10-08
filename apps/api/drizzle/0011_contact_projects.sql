-- 一个人可以在好几条线上。`contacts.project_id` 单列只能是半个答案：一个维护者同时在两个仓库上，
-- 一个招聘同时关着两个岗位。改成关联表，并把已有的那一列搬进去再删。
CREATE TABLE "contact_projects" (
	"contact_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "contact_projects_contact_id_project_id_pk" PRIMARY KEY("contact_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "contact_projects" ADD CONSTRAINT "contact_projects_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_projects" ADD CONSTRAINT "contact_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_projects_project_idx" ON "contact_projects" USING btree ("project_id");--> statement-breakpoint
--> statement-breakpoint
-- THE DATA MOVES BEFORE THE COLUMN GOES. A generated migration would simply drop it, which is a
-- silent loss of every person's project.
INSERT INTO "contact_projects" ("contact_id", "project_id")
SELECT "id", "project_id" FROM "contacts" WHERE "project_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN "project_id";
