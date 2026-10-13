import { and, desc } from 'drizzle-orm'
import { wanted, type Linkable } from '../../shell/links/linkable'
import { instantOf } from './occurrences'
import { visibleMeetings } from './queries'
import { meetings } from './tables'
import { zoneLabel } from './zone'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Oct 20, 21:00 · EDT" -- the meeting's own wall clock, in its own zone. */
function when(startsLocal: string, timeZone: string): string {
  const [date, clock] = startsLocal.split('T') as [string, string]
  const [, m, d] = date.split('-').map(Number) as [number, number, number]
  return `${MONTHS[m - 1]} ${d}, ${clock} · ${zoneLabel(instantOf(startsLocal, timeZone), timeZone)}`
}

export const meetingLinkable: Linkable = {
  type: 'meeting',
  label: 'Meetings',
  rows: async (q, workspaceId, want) => {
    const { where, limit } = wanted(want, meetings.id, ['meetings.title'])
    const found = await q
      .select({
        id: meetings.id,
        title: meetings.title,
        startsLocal: meetings.startsLocal,
        timeZone: meetings.timeZone,
      })
      .from(meetings)
      .where(and(visibleMeetings(workspaceId), where))
      // Latest start first; a series shows once, since this is the series table.
      .orderBy(desc(meetings.startsLocal), desc(meetings.id))
      .limit(limit)
    // The series' own start: an edge is to the series, not to one occurrence.
    return found.map((r) => ({
      id: r.id,
      title: r.title,
      detail: when(r.startsLocal, r.timeZone),
    }))
  },
}
