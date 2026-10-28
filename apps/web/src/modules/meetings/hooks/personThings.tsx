import type { MeetingOccurrence, PersonId } from '@ctws/contracts'
import { clockTime } from '@ctws/core/clock'
import { addDays } from '@ctws/core/day'
import { useQuery } from '@tanstack/react-query'
import { monthDay, weekdayOf, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { useTimeZone } from '../../../shell/auth'
import type { OwnThings } from '../../../shell/contract'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { DurationIcon, PlacesIcon } from '../../../platform/ui/icons'
import { meetingsQuery } from '../api'
import { MEETINGS_ID } from '../logic/id'
import { nextOfEach } from '../logic/nextOfEach'

/** How far each way a person's page looks for the meetings they are in. */
const AHEAD_DAYS = 60
const BACK_DAYS = 180

/**
 * The meetings a person is in (FR-061): those still to come first, each series once at its next
 * occurrence, then those held, each series once at its latest, the latest first. Said by day and
 * time on the account's clock, a weekday within a week of today and a date beyond.
 */
export function useMeetingsWith(personId: PersonId): OwnThings {
  const timeZone = useTimeZone()
  const now = useNow()
  const today = ymd(now, timeZone)
  const window = useQuery(
    meetingsQuery({ from: addDays(today, -BACK_DAYS), to: addDays(today, AHEAD_DAYS) }),
  )
  const theirs = (window.data ?? []).filter((m) => m.attendees.some((a) => a.id === personId))
  const over = (m: MeetingOccurrence) => new Date(m.endsAt).getTime() <= now.getTime()
  const coming = nextOfEach(
    theirs.filter((m) => !over(m)),
    now,
  )
  const latest = new Map<string, MeetingOccurrence>()
  for (const m of theirs.filter(over)) {
    const held = latest.get(m.meetingId)
    if (!held || held.startsAt < m.startsAt) latest.set(m.meetingId, m)
  }
  const held = [...latest.values()]
    .filter((m) => !coming.some((c) => c.meetingId === m.meetingId))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  const projects = useEveryProject()
  const projectOf = (id: string | null) => {
    const p = id ? projects.data?.find((x) => x.id === id) : undefined
    return p ? <ProjectSquare project={p} /> : null
  }
  const said = (m: MeetingOccurrence) => {
    const at = new Date(m.startsAt)
    const day = ymd(at, timeZone)
    const near = day >= addDays(today, -6) && day <= addDays(today, 6)
    return `${near ? weekdayOf(day, true) : monthDay(day)} ${clockTime(at, timeZone)}`
  }
  return {
    things: [...coming, ...held].map((m) => ({
      id: m.meetingId,
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
    isPending: window.isPending,
    isError: window.isError,
    retry: () => void window.refetch(),
  }
}

/** How long a meeting lasts, as a row says it: "45m", "1h", "1h 30m". */
function lasting(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`
}
