ALTER TABLE "resources" ADD COLUMN "preview_state" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "preview_title" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "preview_site" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "icon_id" uuid;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "image_id" uuid;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_icon_id_files_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_image_id_files_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resources_preview_pending_idx" ON "resources" USING btree ("preview_state") WHERE "resources"."preview_state" = 'pending';--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_preview_state_check" CHECK ("resources"."preview_state" in ('pending', 'done', 'none'));