-- Each series keeps the span its occurrences lie in, so a read of a window skips the series that
-- miss it before expanding any. The app works the span out on every write; existing series get a
-- wider one here, which is enough for a filter: a day of slack each way, since Postgres and the
-- app may place a wall clock inside a DST change an hour apart, and no end for a rule ended by a
-- count, which only the app can walk. The first write to a series narrows its span to the app's.
ALTER TABLE "meetings" ADD COLUMN "first_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "last_ends_at" timestamp with time zone;--> statement-breakpoint
WITH "moved" AS (
  SELECT
    e."meeting_id",
    min(coalesce(e."starts_local", e."recurrence_id")::timestamp AT TIME ZONE m."time_zone") AS "first_at",
    max(
      (coalesce(e."starts_local", e."recurrence_id")::timestamp AT TIME ZONE m."time_zone")
        + make_interval(mins => coalesce(e."duration_minutes", m."duration_minutes"))
    ) AS "last_end"
  FROM "meeting_exceptions" e
  JOIN "meetings" m ON m."id" = e."meeting_id"
  WHERE NOT e."cancelled"
  GROUP BY e."meeting_id"
),
"ruled" AS (
  SELECT
    m."id",
    m."starts_local"::timestamp AT TIME ZONE m."time_zone" AS "start_at",
    make_interval(mins => m."duration_minutes") AS "length",
    CASE
      WHEN m."rrule" IS NULL THEN m."starts_local"::timestamp
      WHEN m."rrule" ~* 'COUNT=' THEN NULL
      ELSE make_timestamp(
        substring(u."stamp", 1, 4)::int,
        substring(u."stamp", 5, 2)::int,
        substring(u."stamp", 7, 2)::int,
        substring(u."stamp", 10, 2)::int,
        substring(u."stamp", 12, 2)::int,
        substring(u."stamp", 14, 2)::double precision
      )
    END AS "last_start",
    m."time_zone"
  FROM "meetings" m
  LEFT JOIN LATERAL (
    SELECT substring(m."rrule" FROM '(?i)UNTIL=([0-9]{8}T[0-9]{6})Z') AS "stamp"
  ) u ON true
)
UPDATE "meetings" m SET
  "first_starts_at" = least(r."start_at", mv."first_at") - interval '1 day',
  "last_ends_at" = CASE
    WHEN r."last_start" IS NULL THEN NULL
    ELSE greatest((r."last_start" AT TIME ZONE r."time_zone") + r."length", mv."last_end")
      + interval '1 day'
  END
FROM "ruled" r
LEFT JOIN "moved" mv ON mv."meeting_id" = r."id"
WHERE m."id" = r."id";--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "first_starts_at" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "meetings_window_idx" ON "meetings" USING btree ("workspace_id","last_ends_at");
