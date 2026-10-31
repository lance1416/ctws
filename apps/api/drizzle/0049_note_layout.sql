ALTER TABLE "users" ADD COLUMN "outline_shown" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "readable_lines" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "source_view" boolean DEFAULT false NOT NULL;