import {
  FINISHED_READING_STATUSES,
  type CalendarEntry,
  type ProjectId,
  type WorkspaceId,
  type ReadingId,
} from '@ctws/contracts'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { sqlValues, textMatches } from '../../platform/db/sql'
import { dayEntry } from '../../shell/calendar/entry'
import { filing, projectOfSql } from '../../shell/links/filing'
import { ReadingItemNotFoundError } from './errors'
import { readingItems } from './tables'

type ReadingItem = typeof readingItems.$inferSelect

/** An item with the name of the project it is filed under. */
export type ReadingItemRow = ReadingItem & {
  projectId: ProjectId | null
  projectName: string | null
}

/** A live item in this workspace; every read and write goes through it. */
export function visibleItems(workspaceId: WorkspaceId) {
  return and(eq(readingItems.workspaceId, workspaceId), isNull(readingItems.deletedAt))
}

export const readingFiling = filing('reading', readingItems)

const withProject = { item: readingItems, ...readingFiling.project }

const rowOf = (r: {
  item: ReadingItem
  projectId: ProjectId | null
  projectName: string | null
}): ReadingItemRow => ({ ...r.item, projectId: r.projectId, projectName: r.projectName })

/** Newest first: what was just saved is what you are reaching for. */
export async function listReadingItems(
  q: Queryable,
  workspaceId: WorkspaceId,
  unfiled: boolean,
): Promise<ReadingItemRow[]> {
  const rows = await q
    .select(withProject)
    .from(readingItems)
    .where(and(visibleItems(workspaceId), unfiled ? readingFiling.unfiled() : undefined))
    .orderBy(desc(readingItems.createdAt), desc(readingItems.id))
  return rows.map(rowOf)
}

export async function getReadingItem(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: ReadingId,
): Promise<ReadingItemRow> {
  const [row] = await q
    .select(withProject)
    .from(readingItems)
    .where(and(visibleItems(workspaceId), eq(readingItems.id, id)))
  if (!row) throw new ReadingItemNotFoundError()
  return rowOf(row)
}

/** How many items a search returns. */
const SEARCH_LIMIT = 20

/** By title, author or url: an untitled link is remembered by its host. */
export async function searchReadingItems(
  q: Queryable,
  workspaceId: WorkspaceId,
  query: string,
): Promise<ReadingItemRow[]> {
  const rows = await q
    .select(withProject)
    .from(readingItems)
    .where(
      and(
        visibleItems(workspaceId),
        textMatches(['reading_items.title', 'reading_items.author', 'reading_items.url'], query),
      ),
    )
    .orderBy(desc(readingItems.createdAt), desc(readingItems.id))
    .limit(SEARCH_LIMIT)
  return rows.map(rowOf)
}

/** Unfinished items on the day they are planned for, for the shell's calendar. */
export async function readingEntries(
  q: Queryable,
  workspaceId: WorkspaceId,
  range: { from: string; to: string },
): Promise<CalendarEntry[]> {
  const result = await q.execute(sql`
    select
      r.id,
      to_char(r.plan_on, 'YYYY-MM-DD') as day,
      -- An untitled link shows its url, as everywhere else.
      coalesce(r.title, r.url) as title,
      p.id as "projectId",
      p.name as "projectName"
    from reading_items r
    left join lateral ${projectOfSql('reading', 'r')} p on true
    where r.workspace_id = ${workspaceId}
      and r.deleted_at is null
      and r.plan_on is not null
      and r.status not in (${sqlValues(FINISHED_READING_STATUSES)})
      and r.plan_on between ${range.from}::date and ${range.to}::date
    order by r.plan_on, title
  `)
  type Row = {
    id: ReadingId
    day: string
    title: string
    projectId: ProjectId | null
    projectName: string | null
  }
  return (result.rows as Row[]).map((r) => dayEntry({ ...r, to: '/reading', kind: 'to read' }))
}
