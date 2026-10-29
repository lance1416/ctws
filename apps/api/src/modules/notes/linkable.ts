import { idFrom, noteId } from '@ctws/contracts'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { countWhere, matchingOr, wanted, type Linkable } from '../../shell/links'
import { notes } from './tables'

/** What a text is looked for in. */
const TEXT = ['notes.title', 'notes.body']

export const noteLinkable: Linkable = {
  type: 'note',
  count: (q, workspaceId, text, also) =>
    countWhere(
      q,
      notes,
      within(scoped(notes, workspaceId), matchingOr(TEXT, text, notes.id, also)),
    ),
  // An untitled note on a meeting is called by the meeting's name (`retitle`), so that name finds
  // it too: "Atlas weekly" finds the series' notes (FR-050).
  alsoFound: async (q, workspaceId, text, registry) => {
    const meetings = await registry.of('meeting').rows(q, workspaceId, { text, limit: 50 })
    if (meetings.length === 0) return []
    const found = await q
      .select({ id: notes.id })
      .from(notes)
      .where(
        within(
          scoped(notes, workspaceId),
          and(
            isNull(notes.title),
            eq(notes.anchorType, 'meeting'),
            inArray(
              notes.anchorId,
              meetings.map((m) => m.id),
            ),
          )!,
        ),
      )
    return found.map((r) => r.id)
  },
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit, offset } = wanted(
      want,
      {
        id: notes.id,
        title: sql`coalesce(${notes.title}, left(${notes.body}, 80))`,
        text: TEXT,
      },
      [desc(notes.updatedAt), desc(notes.id)],
    )
    const found = await q
      .select({ id: notes.id, title: notes.title, body: notes.body })
      .from(notes)
      .where(within(scoped(notes, workspaceId), where))
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)
    return found.map((r) => ({
      type: 'note',
      id: r.id,
      // An untitled note is named by its first line, its Markdown left out.
      title: r.title ?? firstLine(r.body),
    }))
  },
  // An untitled note on one meeting is that meeting's, on that day, as every list calls it
  // ("Atlas weekly, Oct 19", FR-050): its name comes from the meetings, through the registry.
  retitle: async (q, workspaceId, rows, registry) => {
    const ids = rows.map((r) => idFrom(noteId, r.id))
    if (ids.length === 0) return rows
    const hung = await q
      .select({ id: notes.id, meetingId: notes.anchorId, occurrenceId: notes.occurrenceId })
      .from(notes)
      .where(
        within(
          scoped(notes, workspaceId),
          and(inArray(notes.id, ids), isNull(notes.title), eq(notes.anchorType, 'meeting'))!,
        ),
      )
    const on = hung.filter((h) => h.meetingId && h.occurrenceId)
    if (on.length === 0) return rows
    const meetingIds = [...new Set(on.map((h) => h.meetingId!))]
    const meetings = await registry
      .of('meeting')
      .rows(q, workspaceId, { ids: meetingIds, limit: meetingIds.length })
    const nameOf = new Map(meetings.map((m) => [m.id, m.title]))
    const named = new Map<string, string>(
      on.flatMap((h) => {
        const meeting = nameOf.get(h.meetingId!)
        return meeting
          ? [[h.id as string, `${meeting}, ${monthDay(h.occurrenceId!.slice(0, 10))}`]]
          : []
      }),
    )
    return rows.map((r) => (named.has(r.id) ? { ...r, title: named.get(r.id)! } : r))
  },
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `Oct 19` from `2026-10-19`, as the web says a day. */
const monthDay = (day: string) =>
  `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`

/** A note's first line without its Markdown: a heading's or a list's marks left out. */
const firstLine = (body: string) =>
  (body.split('\n').find((l) => l.trim() !== '') ?? '')
    .replace(/^#+\s*|^[-*>]\s*|[*_`]/g, '')
    .trim()
    .slice(0, 80) || '(empty note)'
