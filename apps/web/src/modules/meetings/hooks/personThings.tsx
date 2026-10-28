import type { MeetingOccurrence, PersonId } from '@ctws/contracts'
import { clockTime } from '@ctws/core/clock'
import { addDays } from '@ctws/core/day'
import { useQueries, useQuery } from '@tanstack/react-query'
import { shortDay, weekdayOf, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { useTimeZone } from '../../../shell/auth'
import type { OwnThings } from '../../../shell/contract'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { DurationIcon, PlacesIcon } from '../../../platform/ui/icons'
import { heldWithQuery, meetingsQuery, occurrenceQuery } from '../api'
import { MEETINGS_ID } from '../logic/id'
import { nextOfEach } from '../logic/nextOfEach'

/** How far ahead a person's page looks for the meetings they are in. */
const AHEAD_DAYS = 60

/** How many series held with them are read in full; the block shows five before "N more". */
const HELD = 12

/**
 * The meetings a person is in (FR-061): those still to come first, each series once at its next
 * occurrence, then those held, each series once at its latest, the latest first. Said by day and
 * time on the account's clock, a weekday within a week of today and a date beyond.
 */
export function useMeetingsWith(personId: PersonId): OwnThings {
  const timeZone = useTimeZone()
  const now = useNow()
  const today = ymd(now, timeZone)
  const window = useQuery(meetingsQuery({ from: today, to: addDays(today, AHEAD_DAYS) }))
  const theirs = (window.data ?? []).filter((m) => m.attendees.some((a) => a.id === personId))
  const over = (m: MeetingOccurrence) => new Date(m.endsAt).getTime() <= now.getTime()
  const coming = nextOfEach(
    theirs.filter((m) => !over(m)),
    now,
  )
  // Those held, however long ago (BUG-046): a series that meets again is here twice, at its next
  // and at its last, since "when did we last meet" is the question the block answers too.
  const heldWith = useQuery(heldWithQuery(personId))
  const occurrences = useQueries({
    queries: (heldWith.data ?? [])
      .slice(0, HELD)
      .map((h) => occurrenceQuery(h.meetingId, h.recurrenceId)),
  })
  const held = occurrences.flatMap((o) => (o.data ? [o.data] : []))
  const projects = useEveryProject()
  const projectOf = (id: string | null) => {
    const p = id ? projects.data?.find((x) => x.id === id) : undefined
    return p ? <ProjectSquare project={p} /> : null
  }
  const said = (m: MeetingOccurrence) => {
    const at = new Date(m.startsAt)
    const day = ymd(at, timeZone)
    const near = day >= addDays(today, -6) && day <= addDays(today, 6)
    // Another year's says its year: a meeting from 2022 is not this March's.
    return `${near ? weekdayOf(day, true) : shortDay(day, today)} ${clockTime(at, timeZone)}`
  }
  return {
    things: [
      ...coming.map((m) => ({ m, id: m.meetingId as string })),
      // A series already listed as coming is told apart by the occurrence.
      ...held.map((m) => ({
        m,
        id: coming.some((c) => c.meetingId === m.meetingId)
          ? `${m.meetingId}@${m.recurrenceId}`
          : m.meetingId,
      })),
    ].map(({ m, id }) => ({
      id,
      title: m.title,
      to: `/${MEETINGS_ID}/${m.meetingId}?${new URLSearchParams({ at: m.recurrenceId })}`,
      lead: said(m),
      sub: m.location && (
        <span className="inline-flex min-w-0 items-center gap-1">
          <PlacesIcon size={12} aria-hidden="true" className="shrink-0" />
          <span className="truncate">{m.location}</span>
        </span>
      ),
      trail: (
        <span className="flex shrink-0 items-center gap-2.5 text-meta text-muted">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <DurationIcon size={12} aria-hidden="true" />
            {lasting(m.durationMinutes)}
          </span>
          {projectOf(m.projectId)}
        </span>
      ),
    })),
    isPending: window.isPending || heldWith.isPending,
    isError: window.isError || heldWith.isError,
    retry: () => {
      void window.refetch()
      void heldWith.refetch()
    },
  }
}

/** How long a meeting lasts, as a row says it: "45m", "1h", "1h 30m". */
function lasting(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`
}
