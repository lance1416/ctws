ALTER TABLE "notes" ADD COLUMN "day" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "wrap_up_at" text DEFAULT '18:00';--> statement-breakpoint
CREATE UNIQUE INDEX "notes_workspace_day_key" ON "notes" USING btree ("workspace_id","day") WHERE "notes"."day" is not null;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_day_on_its_own" CHECK ("notes"."day" is null or ("notes"."anchor_type" is null and "notes"."folder_id" is null and "notes"."title" is null));