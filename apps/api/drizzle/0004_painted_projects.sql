-- Backfill the project identity colour, which until now was derived in the browser by hashing the
-- project id into one of six buckets. Six buckets collide at random -- four projects share a colour
-- 72% of the time -- so the slot is assigned once and stored instead.
--
-- Numbered by the workspace's own project order (the inbox first, then rank), so the colours a user
-- already saw from top to bottom stay in that reading order, and wrapping at six matches what the
-- app does when it runs out of free slots.
--
-- Idempotent: only rows with no colour are touched, so a re-run is a no-op.
update projects p
set color = 'project-' || (slot.n % 6 + 1)
from (
  select id, row_number() over (
    partition by workspace_id order by is_inbox desc, rank, id
  ) - 1 as n
  from projects
  where deleted_at is null
) slot
where p.id = slot.id and p.color is null;
