import { calendarDate, projectId, taskId, type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable } from '../../../platform/db/client'
import { rowsOf } from '../../../platform/db/raw'
import { taskOpenSql, visibleTasks } from './scope'

const calendarRow = z.object({
  id: taskId,
  day: calendarDate,
  title: z.string(),
  kind: z.enum(['planned', 'due']),
  projectId,
  projectName: z.string(),
  done: z.boolean(),
})

export type CalendarRow = z.output<typeof calendarRow>

/**
 * Open tasks by the day they are planned for and the day they are due, which may be two
 * entries for one task; and the deadlines met, which the calendar keeps struck through (FR-080).
 * A deadline is an instant, so its day is read in the account's zone.
 */
export async function listTaskCalendar(
  q: Queryable,
  workspaceId: WorkspaceId,
  timezone: string,
  range: { from: string; to: string },
): Promise<CalendarRow[]> {
  const result = await q.execute(sql`
    with visible as (
      select t.id, t.title, t.scheduled_on, t.due_at, p.id as project_id, p.name as project_name,
             ${taskOpenSql('t')} as open, t.status = 'done' as done
      from tasks t
      join projects p on p.id = t.project_id
      where ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
        and (${taskOpenSql('t')} or t.status = 'done')
    )
    select id, scheduled_on as day, title, 'planned' as kind,
           project_id as "projectId", project_name as "projectName", false as done
    from visible
    where open and scheduled_on is not null
      and scheduled_on between ${range.from}::date and ${range.to}::date
    union all
    select id, (due_at at time zone ${timezone})::date as day, title,
           'due' as kind, project_id as "projectId", project_name as "projectName", done
    from visible
    where due_at is not null
      and (due_at at time zone ${timezone})::date
          between ${range.from}::date and ${range.to}::date
    order by day, title
  `)
  return rowsOf(result, calendarRow)
}
