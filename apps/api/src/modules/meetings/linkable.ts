import { desc } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { countWhere, matching, wanted, type Linkable } from '../../shell/links'
import { instantOf } from '../../platform/zone'
import { lastMeetingWith, nextMeetingAbout } from './next'
import { meetings } from './tables'

/** What a text is looked for in. */
const TEXT = ['meetings.title']

export const meetingLinkable: Linkable = {
  type: 'meeting',
  count: (q, workspaceId, text) =>
    countWhere(q, meetings, within(scoped(meetings, workspaceId), matching(TEXT, text))),
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit, offset } = wanted(
      want,
      { id: meetings.id, title: meetings.title, text: TEXT },
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
      .offset(offset)
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
