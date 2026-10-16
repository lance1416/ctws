import {
  FINISHED_READING_STATUSES,
  calendarDate,
  projectId,
  readingId,
  type CalendarEntry,
  type ProjectId,
  type ReadingId,
  type WorkspaceId,
} from '@ctws/contracts'
import { desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable, Tx } from '../../platform/db/client'
import { rowsOf } from '../../platform/db/raw'
import { scoped, within } from '../../platform/db/scope'
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
    .where(within(scoped(readingItems, workspaceId), unfiled ? readingFiling.unfiled() : undefined))
    .orderBy(desc(readingItems.createdAt), desc(readingItems.id))
  return rows.map(rowOf)
}

/** One live item in this workspace. Missing, deleted and foreign ids all read as not found. */
export async function getReadingItem(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: ReadingId,
): Promise<ReadingItemRow> {
  const [row] = await q
    .select(withProject)
    .from(readingItems)
    .where(within(scoped(readingItems, workspaceId), eq(readingItems.id, id)))
  if (!row) throw new ReadingItemNotFoundError()
  return rowOf(row)
}

/** `getReadingItem`, with the row locked first, so an edit checks the kind it then writes to. */
export async function lockReadingItem(
  tx: Tx,
  workspaceId: WorkspaceId,
  id: ReadingId,
): Promise<ReadingItemRow> {
  const [row] = await tx
    .select({ id: readingItems.id })
    .from(readingItems)
    .where(within(scoped(readingItems, workspaceId), eq(readingItems.id, id)))
    .for('update')
  if (!row) throw new ReadingItemNotFoundError()
  return getReadingItem(tx, workspaceId, id)
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
      within(
        scoped(readingItems, workspaceId),
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
      r.plan_on as day,
      -- An untitled link shows its url, as everywhere else.
      coalesce(r.title, r.url) as title,
      p.id as "projectId",
      p.name as "projectName"
    from reading_items r
    left join lateral ${projectOfSql('reading', 'r')} p on true
    where ${scoped(readingItems, workspaceId, 'r')}
      and r.plan_on is not null
      and r.status not in (${sqlValues(FINISHED_READING_STATUSES)})
      and r.plan_on between ${range.from}::date and ${range.to}::date
    order by r.plan_on, title
  `)
  const row = z.object({
    id: readingId,
    day: calendarDate,
    title: z.string(),
    projectId: projectId.nullable(),
    projectName: z.string().nullable(),
  })
  return rowsOf(result, row).map((r) => dayEntry({ ...r, to: '/reading', kind: 'to read' }))
}
