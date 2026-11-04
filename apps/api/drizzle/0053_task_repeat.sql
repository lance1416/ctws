ALTER TABLE "tasks" ADD COLUMN "repeat" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "next_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_next_id_tasks_id_fk" FOREIGN KEY ("next_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;