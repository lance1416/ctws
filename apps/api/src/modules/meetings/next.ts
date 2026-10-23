import type { MeetingId, NextAbout, ObjectType, WorkspaceId } from '@ctws/contracts'
import { and, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable } from '../../platform/db/client'
import { rowsOf } from '../../platform/db/raw'
import { scoped, within } from '../../platform/db/scope'
import { occurrencesIn } from './occurrences'
import { meetingExceptions, meetings } from './tables'
import { heldOn, type Tenure } from './tenure'

const DAY_MS = 24 * 60 * 60 * 1000

/** How far ahead a series' rule is walked for its next occurrence. */
const AHEAD_MS = 366 * DAY_MS

const uuids = (ids: readonly string[]) =>
  sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )

/**
 * The next meeting about each task or organisation (FR-058): the soonest occurrence not yet over
 * of a series related to it outright, or, for an organisation, one held while an attendee had a
 * role there, as its timeline counts them (FR-065).
 */
export async function nextMeetingAbout(
  q: Queryable,
  workspaceId: WorkspaceId,
  about: readonly { type: ObjectType; id: string }[],
  now: Date,
): Promise<Map<string, NextAbout>> {
  const out = new Map<string, NextAbout>()
  const ids = [
    ...new Set(
      about.filter((a) => a.type === 'task' || a.type === 'organisation').map((a) => a.id),
    ),
  ]
  if (ids.length === 0) return out
  const organisations = about.filter((a) => a.type === 'organisation').map((a) => a.id)

  const related = rowsOf(
    await q.execute(sql`
      select x.from_id::text as "meetingId", x.to_id::text as "subjectId" from relations x
      where x.workspace_id = ${workspaceId} and x.from_type = 'meeting'
        and x.to_type in ('task', 'organisation') and x.to_id in (${uuids(ids)})
      union
      select x.to_id::text, x.from_id::text from relations x
      where x.workspace_id = ${workspaceId} and x.to_type = 'meeting'
        and x.from_type in ('task', 'organisation') and x.from_id in (${uuids(ids)})`),
    z.object({ meetingId: z.string(), subjectId: z.string() }),
  )
  const attended =
    organisations.length === 0
      ? []
      : rowsOf(
          await q.execute(sql`
            select a.meeting_id::text as "meetingId", r.organisation_id::text as "subjectId",
                   r.person_id::text as "personId", r.from_month::text as "from",
                   r.to_month::text as "to"
            from meeting_attendees a join person_roles r on r.person_id = a.person_id
            where r.workspace_id = ${workspaceId} and r.organisation_id in (${uuids(organisations)})`),
          z.object({
            meetingId: z.string(),
            subjectId: z.string(),
            personId: z.string(),
            from: z.string().nullable(),
            to: z.string().nullable(),
          }),
        )
  const seriesIds = [...new Set([...related, ...attended].map((r) => r.meetingId as MeetingId))]
  if (seriesIds.length === 0) return out

  const [series, exceptions] = await Promise.all([
    q
      .select()
      .from(meetings)
      .where(
        within(
          scoped(meetings, workspaceId),
          and(
            inArray(meetings.id, seriesIds),
            or(isNull(meetings.lastEndsAt), gt(meetings.lastEndsAt, now)),
          ),
        ),
      ),
    q.select().from(meetingExceptions).where(inArray(meetingExceptions.meetingId, seriesIds)),
  ])

  const offer = (subjectId: string, s: (typeof series)[number], startsAt: Date) => {
    const held = out.get(subjectId)?.meeting
    if (held && held.startsAt <= startsAt.toISOString()) return
    out.set(subjectId, { meeting: { id: s.id, title: s.title, startsAt: startsAt.toISOString() } })
  }
  for (const s of series) {
    const coming = occurrencesIn(
      s,
      exceptions.filter((e) => e.meetingId === s.id),
      {
        from: now,
        to: new Date(Math.max(now.getTime() + AHEAD_MS, s.firstStartsAt.getTime() + DAY_MS)),
      },
    )
    if (coming.length === 0) continue
    for (const r of related.filter((r) => r.meetingId === s.id)) {
      offer(r.subjectId, s, coming[0]!.startsAt)
    }
    // Through its people: only the occurrences one of them held a role there on.
    const tenures = new Map<string, Tenure[]>()
    for (const a of attended.filter((a) => a.meetingId === s.id)) {
      tenures.set(a.subjectId, [...(tenures.get(a.subjectId) ?? []), a])
    }
    for (const [subjectId, held] of tenures) {
      const o = coming.find((o) => held.some((t) => heldOn(t, o.startsLocal.slice(0, 10))))
      if (o) offer(subjectId, s, o.startsAt)
    }
  }
  return out
}
