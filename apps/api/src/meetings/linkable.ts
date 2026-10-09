import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { textMatches } from '../db/like'
import { meetings } from '../db/schema'
import type { Linkable } from '../links/linkable'
import { instantOf } from './occurrences'
import { zoneLabel } from './routes'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Oct 20, 21:00 · EDT" -- the meeting's own wall clock, in its own zone. */
function when(startsLocal: string, timeZone: string): string {
  const [date, clock] = startsLocal.split('T') as [string, string]
  const [, m, d] = date.split('-').map(Number) as [number, number, number]
  return `${MONTHS[m - 1]} ${d}, ${clock} · ${zoneLabel(instantOf(startsLocal, timeZone), timeZone)}`
}

/** 会议 names its own meetings for the shell. See `links/linkable.ts` for why this exists. */
export const meetingLinkable: Linkable = {
  type: 'meeting',
  label: 'Meetings',
  name: async (q, workspaceId, ids) => {
    const rows = await q
      .select({
        id: meetings.id,
        title: meetings.title,
        startsLocal: meetings.startsLocal,
        timeZone: meetings.timeZone,
      })
      .from(meetings)
      .where(
        and(
          eq(meetings.workspaceId, workspaceId),
          isNull(meetings.deletedAt),
          inArray(meetings.id, [...ids]),
        ),
      )
    return new Map(
      rows.map((r) => [
        r.id,
        // The SERIES' own start, not an occurrence: an edge is to the series, and which occurrence
        // a reader means is a question only the meeting's own page can answer. The zone is named
        // the way a person says it ("EST"), not as the IANA id, which is a quarter of the row.
        { title: r.title, detail: when(r.startsLocal, r.timeZone) },
      ]),
    )
  },
  find: async (q, workspaceId, text, limit) => {
    const rows = await q
      .select({
        id: meetings.id,
        title: meetings.title,
        startsLocal: meetings.startsLocal,
        timeZone: meetings.timeZone,
      })
      .from(meetings)
      .where(
        and(
          eq(meetings.workspaceId, workspaceId),
          isNull(meetings.deletedAt),
          text === '' ? undefined : textMatches(['meetings.title'], text),
        ),
      )
      // The soonest first. A series shows once here: this is the SERIES table, not its expansion.
      .orderBy(desc(meetings.startsLocal), desc(meetings.id))
      .limit(limit)
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      detail: when(r.startsLocal, r.timeZone),
    }))
  },
}
