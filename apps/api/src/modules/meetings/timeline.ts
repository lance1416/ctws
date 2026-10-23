import type { MeetingId, TimelineEntry, WorkspaceId } from '@ctws/contracts'
import { z } from 'zod'
import { rowsOf } from '../../platform/db/raw'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { scoped, within } from '../../platform/db/scope'
import { instantOf } from '../../platform/zone'
import { isAfterCursor, type TimelineSource } from '../../shell/events'
import { occurrencesIn } from './occurrences'
import { attendeesOf } from './queries'
import { meetingExceptions, meetings } from './tables'
import { heldOn } from './tenure'

/**
 * For an organisation's timeline, a test of each occurrence: related series count whole; others
 * count on the days one of their attendees held a role there. Anything else always counts.
 */
async function organisationFilter(
  q: Queryable,
  workspaceId: WorkspaceId,
  subject: { type: string; id: string },
  seriesIds: readonly string[],
): Promise<(meetingId: string, attendees: readonly { id: string }[], day: string) => boolean> {
  if (subject.type !== 'organisation') return () => true
  const ids = sql.join(
    seriesIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const related = new Set(
    rowsOf(
      await q.execute(sql`
        select x.from_id::text as id from relations x
        where x.workspace_id = ${workspaceId} and x.from_type = 'meeting' and x.from_id in (${ids})
          and x.to_type = 'organisation' and x.to_id = ${subject.id}
        union
        select x.to_id::text from relations x
        where x.workspace_id = ${workspaceId} and x.to_type = 'meeting' and x.to_id in (${ids})
          and x.from_type = 'organisation' and x.from_id = ${subject.id}`),
      z.object({ id: z.string() }),
    ).map((r) => r.id),
  )
  const tenures = rowsOf(
    await q.execute(sql`
      select r.person_id::text as "personId", r.from_month::text as "from", r.to_month::text as "to"
      from person_roles r where r.workspace_id = ${workspaceId} and r.organisation_id = ${subject.id}`),
    z.object({ personId: z.string(), from: z.string().nullable(), to: z.string().nullable() }),
  )
  return (meetingId, attendees, day) =>
    related.has(meetingId) ||
    attendees.some((a) => tenures.some((t) => t.personId === a.id && heldOn(t, day)))
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The meetings a thing was in, one entry per occurrence that has happened (FR-045): a person's
 * are the series they attend, a project's the series held under it, an organisation's those its
 * people attended while they held a role there, or that were related to it outright (FR-065).
 * Occurrences come out of the rule up to now, newest first.
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
          : subject.type === 'organisation'
            ? sql`(exists (
                select 1 from meeting_attendees a join person_roles r on r.person_id = a.person_id
                where a.meeting_id = ${meetings.id} and r.organisation_id = ${subject.id})
              or exists (
                select 1 from relations x
                where (x.from_type = 'meeting' and x.from_id = ${meetings.id}
                       and x.to_type = 'organisation' and x.to_id = ${subject.id})
                   or (x.to_type = 'meeting' and x.to_id = ${meetings.id}
                       and x.from_type = 'organisation' and x.from_id = ${subject.id})))`
            : null
    if (own === null) return []
    const series = await q
      .select()
      .from(meetings)
      .where(within(scoped(meetings, workspaceId), and(own, isNull(meetings.deletedAt))))
    if (series.length === 0) return []
    // For an organisation, which occurrences count is decided per day: an attendee held a role
    // there on that day, or the series itself is related to it (then every occurrence counts).
    const counts = await organisationFilter(
      q,
      workspaceId,
      subject,
      series.map((s) => s.id),
    )
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
        if (!counts(s.id, attending.get(s.id) ?? [], o.startsLocal.slice(0, 10))) continue
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
