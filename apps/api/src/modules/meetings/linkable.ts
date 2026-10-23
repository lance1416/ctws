import { desc } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { wanted, type Linkable } from '../../shell/links'
import { instantOf } from '../../platform/zone'
import { lastMeetingWith, nextMeetingAbout } from './next'
import { meetings } from './tables'

export const meetingLinkable: Linkable = {
  type: 'meeting',
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit } = wanted(
      want,
      { id: meetings.id, title: meetings.title, text: ['meetings.title'] },
      // Latest start first; a series shows once, since this is the series table.
      [desc(meetings.startsLocal), desc(meetings.id)],
    )
    const found = await q
      .select({
        id: meetings.id,
        title: meetings.title,
        startsLocal: meetings.startsLocal,
        timeZone: meetings.timeZone,
      })
      .from(meetings)
      .where(within(scoped(meetings, workspaceId), where))
      .orderBy(...orderBy)
      .limit(limit)
    // The series' own start: an edge is to the series, not to one occurrence.
    return found.map((r) => ({
      type: 'meeting',
      id: r.id,
      title: r.title,
      startsAt: instantOf(r.startsLocal, r.timeZone).toISOString(),
      timeZone: r.timeZone,
    }))
  },
  nextAbout: nextMeetingAbout,
  lastAbout: lastMeetingWith,
}
