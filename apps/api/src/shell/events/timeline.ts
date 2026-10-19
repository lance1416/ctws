import type { TimelineEntry, TimelineKind, WorkspaceId } from '@ctws/contracts'
import { and, desc, eq } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { type Page, type PageAsked, pageOf, spanOf } from '../../platform/db/page'
import { scoped, within } from '../../platform/db/scope'
import type { Subject } from './log'
import { events } from './tables'

/**
 * One kind of timeline entry a module keeps about other things: the messages that name a person,
 * the meetings a person attended, the notes hung on a project. A source answers with the entries
 * of its kind for one subject, newest first, as many as asked for.
 */
export type TimelineSource = {
  kind: TimelineKind
  read: (
    q: Queryable,
    workspaceId: WorkspaceId,
    subject: Subject,
    limit: number,
  ) => Promise<TimelineEntry[]>
}

/** The thing's own change log, newest first. */
async function changes(
  q: Queryable,
  workspaceId: WorkspaceId,
  subject: Subject,
  limit: number,
): Promise<TimelineEntry[]> {
  const rows = await q
    .select({ type: events.type, payload: events.payload, occurredAt: events.occurredAt })
    .from(events)
    .where(
      within(
        scoped(events, workspaceId),
        and(eq(events.objectType, subject.type), eq(events.objectId, subject.id)),
      ),
    )
    .orderBy(desc(events.occurredAt), desc(events.id))
    .limit(limit)
  return rows.map((r) => ({
    kind: 'change',
    at: r.occurredAt.toISOString(),
    event: { type: r.type, payload: r.payload },
  }))
}

const CHANGES: TimelineSource = { kind: 'change', read: changes }

/** What tells two entries at one instant apart: the id of what each one is about. */
const keyOf = (e: TimelineEntry): string => {
  switch (e.kind) {
    case 'change':
      return `change:${e.event.type}`
    case 'message':
      return `message:${e.message.id}`
    case 'note':
      return `note:${e.note.id}`
  }
}

/**
 * A thing's timeline: every source's entries for it, merged newest first, one page of them. Each
 * source is asked for the whole span up to this page's end, since a page may be all of one kind;
 * a timeline that runs to hundreds of entries is read a segment at a time (FR-015).
 */
export async function readTimeline(
  q: Queryable,
  sources: readonly TimelineSource[],
  workspaceId: WorkspaceId,
  subject: Subject,
  kinds: readonly TimelineKind[] | undefined,
  asked: PageAsked,
): Promise<Page<TimelineEntry>> {
  const { limit, offset } = spanOf(asked)
  const wanted = [CHANGES, ...sources].filter((s) => !kinds || kinds.includes(s.kind))
  const lists = await Promise.all(
    wanted.map((s) => s.read(q, workspaceId, subject, limit + offset)),
  )
  // Newest first; two entries at one instant (a command's events share it) keep a fixed order by
  // their own ids, which are time-ordered, so a page never shows a row twice or skips one.
  const merged = lists
    .flat()
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : keyOf(b).localeCompare(keyOf(a))))
  return pageOf(merged.slice(offset, offset + limit), asked)
}
