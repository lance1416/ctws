import type { TimelineEntry, TimelineKind, WorkspaceId } from '@ctws/contracts'
import { and, desc, eq, lte } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { scoped, within } from '../../platform/db/scope'
import type { Subject } from './log'
import { events } from './tables'

/** How much of a timeline a read wants: at most `limit` entries, none newer than `before`. */
type TimelineSpan = { limit: number; before: Date | null }

/**
 * One kind of timeline entry a module keeps about other things: the messages that name a person,
 * the meetings a person attended, the notes hung on a project. A source answers with the entries
 * of its kind for one subject, newest first, within the span asked for.
 */
export type TimelineSource = {
  kind: TimelineKind
  read: (
    q: Queryable,
    workspaceId: WorkspaceId,
    subject: Subject,
    span: TimelineSpan,
  ) => Promise<TimelineEntry[]>
}

/** The thing's own change log, newest first. */
async function changes(
  q: Queryable,
  workspaceId: WorkspaceId,
  subject: Subject,
  { limit, before }: TimelineSpan,
): Promise<TimelineEntry[]> {
  const rows = await q
    .select({
      id: events.id,
      type: events.type,
      payload: events.payload,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .where(
      within(
        scoped(events, workspaceId),
        and(
          eq(events.objectType, subject.type),
          eq(events.objectId, subject.id),
          before ? lte(events.occurredAt, before) : undefined,
        ),
      ),
    )
    .orderBy(desc(events.occurredAt), desc(events.id))
    .limit(limit)
  return rows.map((r) => ({
    kind: 'change',
    id: r.id,
    at: r.occurredAt.toISOString(),
    event: { type: r.type, payload: r.payload },
  }))
}

const CHANGES: TimelineSource = { kind: 'change', read: changes }

/** What tells two entries at one instant apart: the id of what each one is. */
const keyOf = (e: TimelineEntry): string => {
  switch (e.kind) {
    case 'change':
      return `change:${e.id}`
    case 'message':
      return `message:${e.message.id}`
    case 'note':
      return `note:${e.note.id}`
  }
}

/** Newest first; at one instant (a command's events share it) by key, so the order is fixed. */
const newestFirst = (a: TimelineEntry, b: TimelineEntry): number =>
  a.at < b.at ? 1 : a.at > b.at ? -1 : keyOf(b).localeCompare(keyOf(a))

/**
 * A page's cursor is the last entry it showed, `at|key`: the next page is everything that sorts
 * after it. An offset would shift under a reader when an entry is logged or removed while they
 * scroll, and show one twice or skip one; this is stable.
 */
const cursorOf = (e: TimelineEntry): string => `${e.at}|${keyOf(e)}`

const parseCursor = (cursor: string | undefined): { at: string; key: string } | null => {
  if (!cursor) return null
  const bar = cursor.indexOf('|')
  return bar < 0 ? null : { at: cursor.slice(0, bar), key: cursor.slice(bar + 1) }
}

export type TimelinePage = {
  rows: TimelineEntry[]
  page: { limit: number; nextCursor: string | null }
}

/**
 * A thing's timeline: every source's entries for it, merged newest first, one page of them. Each
 * source is asked for a whole page of its own, since a page may be all of one kind; a timeline
 * that runs to hundreds of entries is read a segment at a time (FR-015).
 */
export async function readTimeline(
  q: Queryable,
  sources: readonly TimelineSource[],
  workspaceId: WorkspaceId,
  subject: Subject,
  kinds: readonly TimelineKind[] | undefined,
  asked: { limit: number; cursor?: string | undefined },
): Promise<TimelinePage> {
  const after = parseCursor(asked.cursor)
  // One more than the page, so whether there is a next page is known without counting. Entries
  // at the cursor's own instant are read again and dropped below, as those before it in key order
  // were on the last page.
  const span: TimelineSpan = { limit: asked.limit + 1, before: after ? new Date(after.at) : null }
  const wanted = [CHANGES, ...sources].filter((s) => !kinds || kinds.includes(s.kind))
  const lists = await Promise.all(wanted.map((s) => s.read(q, workspaceId, subject, span)))
  const merged = lists
    .flat()
    .filter(
      (e) =>
        !after || e.at < after.at || (e.at === after.at && keyOf(e).localeCompare(after.key) < 0),
    )
    .sort(newestFirst)
  const rows = merged.slice(0, asked.limit)
  const last = rows[rows.length - 1]
  return {
    rows,
    page: {
      limit: asked.limit,
      nextCursor: merged.length > asked.limit && last ? cursorOf(last) : null,
    },
  }
}
