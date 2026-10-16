-- A link gets its own id, so it can be read and removed by it. Existing edges are named here; new
-- ones are named by the app. Both ends and the kind stay unique, as they were as the key.
ALTER TABLE "links" ADD COLUMN "id" uuid;--> statement-breakpoint
UPDATE "links" SET "id" = gen_random_uuid();--> statement-breakpoint
ALTER TABLE "links" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "links" DROP CONSTRAINT "links_from_type_from_id_to_type_to_id_kind_pk";--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_pkey" PRIMARY KEY("id");--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_edge_key" UNIQUE("from_type","from_id","to_type","to_id","kind");
