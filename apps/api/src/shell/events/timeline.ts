import type { TimelineEntry, TimelineKind, WorkspaceId } from '@ctws/contracts'
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { Queryable } from '../../platform/db/client'
import { DomainError } from '../../platform/errors'
import { scoped, within } from '../../platform/db/scope'
import type { Subject } from './log'
import { events } from './tables'

/**
 * Where a page ends: the last entry shown, as its instant and its key. The next page is every
 * entry that sorts after it: older, or at the same instant with a smaller key.
 */
type TimelineCursor = { at: Date; key: string }

/** How much of a timeline a read wants: at most `limit` entries, all after `cursor` when set. */
export type TimelineSpan = { limit: number; cursor: TimelineCursor | null; now: Date }

/**
 * One kind of timeline entry a module keeps about other things: the messages that name a person,
 * the meetings a person attended, the notes hung on a project. A source answers with the entries
 * of its kind for one subject, newest first, within the span asked for; `keyOf` says how its
 * entries are keyed, so it can cut at the cursor the same way the merge sorts.
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

/** What tells two entries at one instant apart, and where a page cuts: `kind:id`. */
const keyOf = (e: TimelineEntry): string => {
  switch (e.kind) {
    case 'change':
      return `change:${e.id}`
    case 'message':
      return `message:${e.message.id}`
    case 'meeting':
      return `meeting:${e.meeting.meetingId}:${e.meeting.recurrenceId}`
    case 'note':
      return `note:${e.note.id}`
    case 'mention':
      return `mention:${e.relationId}`
  }
}

/**
 * The rows after the cursor, for a source whose rows are keyed `<kind>:<id>`: older than it, or
 * at its instant with a smaller key. Nothing to add when there is no cursor.
 */
export const afterCursor = (
  span: TimelineSpan,
  kind: TimelineKind,
  columns: { at: AnyPgColumn | SQL; id: AnyPgColumn | SQL },
): SQL | undefined =>
  span.cursor === null
    ? undefined
    : sql`(${columns.at} < ${span.cursor.at} or (${columns.at} = ${span.cursor.at} and ${sql.raw(`'${kind}:'`)} || ${columns.id}::text < ${span.cursor.key}))`

/** The same cut, for a source that builds its entries in memory. */
export const isAfterCursor = (span: TimelineSpan, e: TimelineEntry): boolean =>
  span.cursor === null ||
  e.at < span.cursor.at.toISOString() ||
  (e.at === span.cursor.at.toISOString() && keyOf(e) < span.cursor.key)

/** The thing's own change log, newest first. */
async function changes(
  q: Queryable,
  workspaceId: WorkspaceId,
  subject: Subject,
  span: TimelineSpan,
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
          afterCursor(span, 'change', { at: events.occurredAt, id: events.id }),
        ),
      ),
    )
    .orderBy(desc(events.occurredAt), desc(events.id))
    .limit(span.limit)
  return rows.map((r) => ({
    kind: 'change',
    id: r.id,
    at: r.occurredAt.toISOString(),
    event: { type: r.type, payload: r.payload },
  }))
}

const CHANGES: TimelineSource = { kind: 'change', read: changes }

/** Newest first; at one instant (a command's events share it) by key, so the order is fixed. */
const newestFirst = (a: TimelineEntry, b: TimelineEntry): number =>
  a.at < b.at ? 1 : a.at > b.at ? -1 : keyOf(b) < keyOf(a) ? -1 : keyOf(b) > keyOf(a) ? 1 : 0

/**
 * A page's cursor is the last entry it showed, `at|key`: the next page is everything that sorts
 * after it. An offset would shift under a reader when an entry is logged or removed while they
 * scroll, and show one twice or skip one; this is stable.
 */
const cursorOf = (e: TimelineEntry): string => `${e.at}|${keyOf(e)}`

class NotACursor extends DomainError {
  constructor() {
    super('invalid', { detail: 'not a cursor this timeline gave out' })
  }
}

const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([a-z]+:.+)$/

function parseCursor(cursor: string | undefined): TimelineCursor | null {
  if (cursor === undefined) return null
  const m = CURSOR.exec(cursor)
  if (!m || Number.isNaN(new Date(m[1]!).getTime())) throw new NotACursor()
  return { at: new Date(m[1]!), key: m[2]! }
}

export type TimelinePage = {
  rows: TimelineEntry[]
  page: { limit: number; nextCursor: string | null }
}

/**
 * A thing's timeline: every source's entries for it, merged newest first, one page of them. Each
 * source is asked for a whole page of its own after the cursor, since a page may be all of one
 * kind; a timeline that runs to hundreds of entries is read a segment at a time (FR-015).
 */
export async function readTimeline(
  q: Queryable,
  sources: readonly TimelineSource[],
  workspaceId: WorkspaceId,
  subject: Subject,
  kinds: readonly TimelineKind[] | undefined,
  asked: { limit: number; cursor?: string | undefined; now: Date },
): Promise<TimelinePage> {
  // One more than the page, so whether there is a next page is known without counting.
  const span: TimelineSpan = {
    limit: asked.limit + 1,
    cursor: parseCursor(asked.cursor),
    now: asked.now,
  }
  const wanted = [CHANGES, ...sources].filter((s) => !kinds || kinds.includes(s.kind))
  const lists = await Promise.all(wanted.map((s) => s.read(q, workspaceId, subject, span)))
  const merged = lists.flat().sort(newestFirst)
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
