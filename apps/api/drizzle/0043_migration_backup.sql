CREATE TABLE "migration_backup" (
	"key" text PRIMARY KEY NOT NULL,
	"backup_ref" text NOT NULL,
	"backup_bytes" text NOT NULL,
	"chosen_at" timestamp with time zone NOT NULL
);
