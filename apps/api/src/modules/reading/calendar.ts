import { sql } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { projectOfSql } from '../../shell/links/filing'

/**
 * THE READING MODULE'S DATED THINGS: the day you mean to finish something by.
 *
 * One kind, and one already stored as a calendar day, so there is no zone arithmetic to get
 * wrong here. It exists so the calendar's contribution point has TWO modules behind it -- a seam
 * shaped by one module is that module's shape wearing a general name.
 *
 * Finished items are left out for the same reason the task module leaves out done tasks: the
 * calendar answers what is happening on which day, and a book you have read is not a plan.
 */
export async function listReadingCalendar(
  q: Queryable,
  workspaceId: string,
  range: { from: string; to: string },
): Promise<
  {
    id: string
    day: string
    title: string
    kind: string
    project_id: string | null
    project_name: string | null
  }[]
> {
  const result = await q.execute(sql`
    select
      r.id,
      to_char(r.plan_on, 'YYYY-MM-DD') as day,
      -- An untitled link is shown by its host everywhere else; the calendar has even less room,
      -- so the fallback happens here rather than leaving a blank square.
      coalesce(r.title, r.url) as title,
      'to read' as kind,
      p.id as project_id,
      p.name as project_name
    from reading_items r
    -- One project per square: the first by rank, as on the item's own row.
    left join lateral ${projectOfSql('reading', 'r')} p on true
    where r.workspace_id = ${workspaceId}
      and r.deleted_at is null
      and r.plan_on is not null
      and r.status not in ('done', 'dropped')
      and r.plan_on between ${range.from}::date and ${range.to}::date
    order by r.plan_on, title
  `)
  return result.rows as Awaited<ReturnType<typeof listReadingCalendar>>
}
