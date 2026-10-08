import { sql } from 'drizzle-orm'
import type { Queryable } from '../db/client'

/**
 * THE TASK MODULE'S DATED THINGS, for the shell's calendar.
 *
 * Two kinds, and a task can be both at once: it has a 排期 (a calendar day, stored as one) and a
 * 截止 (an instant). They are different facts about the same task and both belong on the grid, so
 * one task may produce two entries on two squares.
 *
 * THE DAY IS COMPUTED HERE, in the account's zone -- the same rule `listToday`, `listCompleted`
 * and the weekly review follow. `scheduled_on` is already a day and is cast to text so
 * node-postgres cannot parse it into a JS Date at server-local midnight; `due_at` is an instant
 * and becomes a day only by being read in the account's zone. A client doing that conversion
 * would put a 23:00 deadline on the wrong square for half the world.
 */

export type CalendarRow = {
  id: string
  day: string
  title: string
  kind: string
  project_id: string
  project_name: string
}

export async function listTaskCalendar(
  q: Queryable,
  workspaceId: string,
  timezone: string,
  range: { from: string; to: string },
): Promise<CalendarRow[]> {
  const result = await q.execute(sql`
    with visible as (
      select t.id, t.title, t.scheduled_on, t.due_at, p.id as project_id, p.name as project_name
      from tasks t
      join projects p on p.id = t.project_id
      where p.workspace_id = ${workspaceId}
        and t.deleted_at is null
        and p.deleted_at is null
        -- A finished task is not something to plan around. It stays in Done, which is the
        -- surface for looking backwards; the calendar answers "what is there on which day".
        and t.status not in ('done', 'cancelled')
    )
    select id, to_char(scheduled_on, 'YYYY-MM-DD') as day, title, 'planned' as kind,
           project_id, project_name
    from visible
    where scheduled_on is not null
      and scheduled_on between ${range.from}::date and ${range.to}::date
    union all
    select id, to_char((due_at at time zone ${timezone})::date, 'YYYY-MM-DD') as day, title,
           'due' as kind, project_id, project_name
    from visible
    where due_at is not null
      and (due_at at time zone ${timezone})::date
          between ${range.from}::date and ${range.to}::date
    order by day, title
  `)
  return result.rows as CalendarRow[]
}
