-- The cookie's token is no longer stored verbatim: the row holds `sha256(token)` and is looked
-- up by it (D2). Anything that can read this table used to hold a working session -- not a thing
-- to crack, a thing to paste into a cookie jar.
--
-- EVERY EXISTING SESSION IS DROPPED rather than migrated: the old rows hold the token itself and
-- there is nothing to derive the new column from without it, and the only cost is signing in
-- again. Done first, so the column can be NOT NULL.
delete from sessions;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "token_hash" text NOT NULL;
--> statement-breakpoint
-- Unique because it is the lookup key, and an index because every authenticated request uses it.
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" ("token_hash");
