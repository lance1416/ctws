import type { MeetingId, TimelineEntry } from '@ctws/contracts'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { scoped, within } from '../../platform/db/scope'
import { instantOf } from '../../platform/zone'
import { isAfterCursor, type TimelineSource } from '../../shell/events'
import { occurrencesIn } from './occurrences'
import { attendeesOf } from './queries'
import { meetingExceptions, meetings } from './tables'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The meetings a thing was in, one entry per occurrence that has happened (FR-045): a person's
 * are the series they attend, a project's the series held under it. Occurrences come out of the
 * rule up to now, newest first.
 */
export const meetingSource: TimelineSource = {
  kind: 'meeting',
  read: async (q: Queryable, workspaceId, subject, span) => {
    const own =
      subject.type === 'project'
        ? eq(meetings.projectId, subject.id as never)
        : subject.type === 'person'
          ? sql`exists (
              select 1 from meeting_attendees a
              where a.meeting_id = ${meetings.id} and a.person_id = ${subject.id})`
          : null
    if (own === null) return []
    const series = await q
      .select()
      .from(meetings)
      .where(within(scoped(meetings, workspaceId), and(own, isNull(meetings.deletedAt))))
    if (series.length === 0) return []
    const ids = series.map((s) => s.id as MeetingId)
    const [attending, exceptions] = await Promise.all([
      attendeesOf(q, ids),
      q.select().from(meetingExceptions).where(inArray(meetingExceptions.meetingId, ids)),
    ])
    const until = span.cursor?.at ?? span.now
    const entries: TimelineEntry[] = []
    for (const s of series) {
      const from = new Date(instantOf(s.startsLocal, s.timeZone).getTime() - DAY_MS)
      if (from > until) continue
      const occurrences = occurrencesIn(
        s,
        exceptions.filter((e) => e.meetingId === s.id),
        { from, to: until },
      )
      for (const o of occurrences) {
        if (o.startsAt > until) continue
        entries.push({
          kind: 'meeting',
          at: o.startsAt.toISOString(),
          meeting: {
            meetingId: s.id,
            recurrenceId: o.recurrenceId,
            title: s.title,
            durationMinutes: o.durationMinutes,
            timeZone: o.timeZone,
            attendees: attending.get(s.id) ?? [],
          },
        })
      }
    }
    return entries
      .filter((e) => isAfterCursor(span, e))
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, span.limit)
  },
}
