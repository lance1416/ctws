ALTER TABLE "reading_items" ADD COLUMN "fetched_title" text;--> statement-breakpoint
ALTER TABLE "reading_items" ADD COLUMN "fetched_summary" text;--> statement-breakpoint
ALTER TABLE "reading_items" ADD COLUMN "fetched_at" timestamp with time zone;