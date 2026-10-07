-- New tasks default to 'todo' from 2026-10-07 (contracts: `createTaskBody`). This moves the rows
-- that landed on 'backlog' only BECAUSE of the old default, and leaves alone the ones a person
-- actually chose to put there.
--
-- The two are told apart by the event log, which is why it exists: a status a person chose was
-- written by `updateTask` and left a `status_changed` row behind. A task whose history contains
-- no move INTO 'backlog' is one that has simply never been touched since it was created.
--
-- Idempotent: after this runs, the rows it moved are 'todo' and no longer match.
update tasks t
set status = 'todo'
where t.status = 'backlog'
  and not exists (
    select 1 from task_events ev
    where ev.task_id = t.id
      and ev.type = 'status_changed'
      and ev.payload ->> 'to' = 'backlog'
  );
