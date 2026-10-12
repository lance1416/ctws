-- The NOT NULL constraints Postgres 18 names on its own (`<table>_<column>_not_null`), which 0020
-- did not rename: a people column must not answer to a contact's name. Looked up rather than
-- listed, because a database created before Postgres named these constraints has none of them.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE conrelid IN ('people'::regclass, 'person_channels'::regclass)
      AND conname LIKE 'contact%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
      r.tbl,
      r.conname,
      replace(replace(replace(r.conname, 'contact_channels', 'person_channels'), 'contact_id', 'person_id'), 'contacts', 'people')
    );
  END LOOP;
END $$;
