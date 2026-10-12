-- CONTACTS ARE PEOPLE. Renames only, never drop-and-create: every row, id and edge stays where it
-- is, and a database that already holds people keeps all of them (tests/people-migration.test.ts).
ALTER TABLE "contacts" RENAME TO "people";--> statement-breakpoint
ALTER TABLE "contact_channels" RENAME TO "person_channels";--> statement-breakpoint
ALTER TABLE "person_channels" RENAME COLUMN "contact_id" TO "person_id";--> statement-breakpoint
ALTER INDEX "contacts_pkey" RENAME TO "people_pkey";--> statement-breakpoint
ALTER INDEX "contact_channels_pkey" RENAME TO "person_channels_pkey";--> statement-breakpoint
ALTER INDEX "contacts_workspace_name_idx" RENAME TO "people_workspace_name_idx";--> statement-breakpoint
ALTER INDEX "contacts_birthday_idx" RENAME TO "people_birthday_idx";--> statement-breakpoint
ALTER INDEX "contact_channels_contact_idx" RENAME TO "person_channels_person_idx";--> statement-breakpoint
ALTER TABLE "people" RENAME CONSTRAINT "contacts_workspace_id_workspaces_id_fk" TO "people_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "people" RENAME CONSTRAINT "contacts_birthday_calendar_check" TO "people_birthday_calendar_check";--> statement-breakpoint
ALTER TABLE "people" RENAME CONSTRAINT "contacts_gender_check" TO "people_gender_check";--> statement-breakpoint
ALTER TABLE "people" RENAME CONSTRAINT "contacts_circle_check" TO "people_circle_check";--> statement-breakpoint
ALTER TABLE "people" RENAME CONSTRAINT "contacts_birthday_month_check" TO "people_birthday_month_check";--> statement-breakpoint
ALTER TABLE "people" RENAME CONSTRAINT "contacts_birthday_day_check" TO "people_birthday_day_check";--> statement-breakpoint
ALTER TABLE "people" RENAME CONSTRAINT "contacts_birthday_hour_check" TO "people_birthday_hour_check";--> statement-breakpoint
ALTER TABLE "people" RENAME CONSTRAINT "contacts_birthday_lead_check" TO "people_birthday_lead_check";--> statement-breakpoint
ALTER TABLE "people" RENAME CONSTRAINT "contacts_birthday_daymonth_check" TO "people_birthday_daymonth_check";--> statement-breakpoint
ALTER TABLE "people" RENAME CONSTRAINT "contacts_birthday_group_check" TO "people_birthday_group_check";--> statement-breakpoint
ALTER TABLE "person_channels" RENAME CONSTRAINT "contact_channels_contact_id_contacts_id_fk" TO "person_channels_person_id_people_id_fk";--> statement-breakpoint
ALTER TABLE "person_channels" RENAME CONSTRAINT "contact_channels_kind_check" TO "person_channels_kind_check";--> statement-breakpoint
-- The type name stored inside every edge. The checks name the old value, so they come off first
-- and go back on naming the new one.
ALTER TABLE "links" DROP CONSTRAINT "links_type_check";--> statement-breakpoint
ALTER TABLE "links" DROP CONSTRAINT "links_to_type_check";--> statement-breakpoint
UPDATE "links" SET "from_type" = 'person' WHERE "from_type" = 'contact';--> statement-breakpoint
UPDATE "links" SET "to_type" = 'person' WHERE "to_type" = 'contact';--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_type_check" CHECK ("links"."from_type" in ('task', 'reading', 'person', 'meeting', 'project'));--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_to_type_check" CHECK ("links"."to_type" in ('task', 'reading', 'person', 'meeting', 'project'));
