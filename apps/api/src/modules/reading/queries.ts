import {
  FINISHED_READING_STATUSES,
  calendarDate,
  projectId,
  readingId,
  type CalendarEntry,
  type ReadingId,
  type WorkspaceId,
} from '@ctws/contracts'
import { desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable, Tx } from '../../platform/db/client'
import { rowsOf } from '../../platform/db/raw'
import { scoped, within } from '../../platform/db/scope'
import { sqlValues, textMatches } from '../../platform/db/sql'
import { dayEntry } from '../../shell/calendar'
import { projectNameSql } from '../../shell/projects'
import { readingItems } from './tables'
import { NotFound } from '../../platform/errors'
import { type Page, type PageAsked, pageOf, spanOf } from '../../platform/db/page'

type ReadingItem = typeof readingItems.$inferSelect

/** An item with the name of the project it is filed under, and since when it is as it is. */
export type ReadingItemRow = ReadingItem & { projectName: string | null; statusSince: Date }

/**
 * When the item last took the status it has (FR-072, FR-073): "Since Sep 30" on a card, started
 * and finished on its page. Its log says; one never changed has had its status since it was added.
 * Correlated through the literal `reading_items`: a drizzle column would render unqualified.
 */
const statusSinceSql = sql<string | null>`(
  select max(e.occurred_at) from events e
  where e.object_type = 'reading' and e.object_id = reading_items.id
    and e.type = 'field_changed' and e.payload->>'field' = 'status'
    and e.payload->>'to' = reading_items.status
)`

const withProject = {
  item: readingItems,
  projectName: projectNameSql(readingItems.projectId),
  statusSince: statusSinceSql,
}

// A deleted project is kept on the row for history, but the page names only a live one.
const rowOf = (r: {
  item: ReadingItem
  projectName: string | null
  statusSince: string | Date | null
}): ReadingItemRow => ({
  ...r.item,
  projectId: r.projectName === null ? null : r.item.projectId,
  projectName: r.projectName,
  statusSince: r.statusSince === null ? r.item.createdAt : new Date(r.statusSince),
})

/** Items filed under no project, or under one that is gone. */
const unfiledNow = () =>
  sql`not exists (
    select 1 from projects p where p.id = ${readingItems.projectId} and p.deleted_at is null
  )`

/** Newest first: what was just saved is what you are reaching for. */
export async function listReadingItems(
  q: Queryable,
  workspaceId: WorkspaceId,
  unfiled: boolean,
  asked: PageAsked,
): Promise<Page<ReadingItemRow>> {
  const span = spanOf(asked)
  const rows = await q
    .select(withProject)
    .from(readingItems)
    .where(within(scoped(readingItems, workspaceId), unfiled ? unfiledNow() : undefined))
    .orderBy(desc(readingItems.createdAt), desc(readingItems.id))
    .limit(span.limit)
    .offset(span.offset)
  const { rows: page, ...info } = pageOf(rows, asked)
  return { rows: page.map(rowOf), ...info }
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
  if (!row) throw new NotFound('Reading item')
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
  if (!row) throw new NotFound('Reading item')
  return getReadingItem(tx, workspaceId, id)
}

/** By title, fetched title, author or url: an untitled link is remembered by its host. */
export async function searchReadingItems(
  q: Queryable,
  workspaceId: WorkspaceId,
  query: string,
  asked: PageAsked,
): Promise<Page<ReadingItemRow>> {
  const span = spanOf(asked)
  const rows = await q
    .select(withProject)
    .from(readingItems)
    .where(
      within(
        scoped(readingItems, workspaceId),
        textMatches(
          [
            'reading_items.title',
            'reading_items.fetched_title',
            'reading_items.author',
            'reading_items.url',
          ],
          query,
        ),
      ),
    )
    .orderBy(desc(readingItems.createdAt), desc(readingItems.id))
    .limit(span.limit)
    .offset(span.offset)
  const { rows: page, ...info } = pageOf(rows, asked)
  return { rows: page.map(rowOf), ...info }
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
      -- An untitled link shows the title fetched from its page, else its url, as everywhere else.
      coalesce(r.title, r.fetched_title, r.url) as title,
      r.project_id as "projectId",
      ${projectNameSql(sql`r.project_id`)} as "projectName"
    from reading_items r
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
  return rowsOf(result, row).map((r) =>
    dayEntry({
      ...r,
      projectId: r.projectName === null ? null : r.projectId,
      type: 'reading',
      kind: 'to-read',
    }),
  )
}
