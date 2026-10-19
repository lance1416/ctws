CREATE TABLE "circles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "circles_workspace_name_key" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
CREATE TABLE "person_aliases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"name" text NOT NULL,
	"label" text,
	"rank" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_circles" (
	"person_id" uuid NOT NULL,
	"circle_id" uuid NOT NULL,
	CONSTRAINT "person_circles_person_id_circle_id_pk" PRIMARY KEY("person_id","circle_id")
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "given_name" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "middle_name" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "family_name" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "sort_key" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "time_zone" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "time_zone_source" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "city_key" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "hometown_key" text;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_aliases" ADD CONSTRAINT "person_aliases_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_circles" ADD CONSTRAINT "person_circles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_circles" ADD CONSTRAINT "person_circles_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_aliases_person_idx" ON "person_aliases" USING btree ("person_id","rank");--> statement-breakpoint
CREATE INDEX "person_circles_circle_idx" ON "person_circles" USING btree ("circle_id");--> statement-breakpoint
CREATE INDEX "people_workspace_sort_idx" ON "people" USING btree ("workspace_id","sort_key","name");--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_time_zone_source_check" CHECK (("people"."time_zone" is null and "people"."time_zone_source" is null)
          or ("people"."time_zone" is not null and "people"."time_zone_source" in ('city', 'manual')));--> statement-breakpoint
-- Until the data migration splits every name (FR-095), the whole name is the given name and the
-- letter is its first character, so the columns can be NOT NULL from here on.
UPDATE "people" SET "given_name" = "name", "sort_key" = upper(left("name", 1)) WHERE "given_name" IS NULL;--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "given_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "sort_key" SET NOT NULL;
