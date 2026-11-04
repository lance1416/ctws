ALTER TABLE "circles" ADD COLUMN "touch_every" text;--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "touch_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "touch_every" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "touch_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "touch_later_until" date;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "touch_later_since" timestamp with time zone;