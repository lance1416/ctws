import type { ProjectId } from '@ctws/contracts'
import { clockTime } from '@ctws/core/clock'
import { addDays } from '@ctws/core/day'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { monthDay, weekdayOf, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { useTimeZone } from '../../../shell/auth'
import type { OwnThings } from '../../../shell/contract'
import { meetingsQuery } from '../api'
import { MEETINGS_ID } from '../logic/id'
import { nextOfEach } from '../logic/nextOfEach'

/** How far ahead a project's page looks for its meetings: the month the Meetings page shows. */
const AHEAD_DAYS = 31

/**
 * A project's meetings coming up (FR-055): each series once, at its next occurrence, said by its
 * day and time on the account's clock: the weekday within the week ("Thu 14:00"), the date after
 * it ("Nov 21 10:00"), so a Saturday a month off is not read as this one (BUG-038).
 */
/** The meetings the block reads: from today, AHEAD_DAYS on. */
const comingQuery = (today: string) =>
  meetingsQuery({ from: today, to: addDays(today, AHEAD_DAYS) })

/** Starts what the block will read, when its page is opened (baseline.md §8). */
export function prefetchProjectMeetings(qc: QueryClient, today: string): void {
  void qc.prefetchQuery(comingQuery(today))
}

export function useProjectMeetings(projectId: ProjectId): OwnThings {
  const timeZone = useTimeZone()
  const now = useNow()
  const today = ymd(now, timeZone)
  const coming = useQuery(comingQuery(today))
  const mine = (coming.data ?? []).filter((m) => m.projectId === projectId)
  return {
    things: nextOfEach(mine, now).map((m) => {
      const at = new Date(m.startsAt)
      const day = ymd(at, timeZone)
      const said = day <= addDays(today, 6) ? weekdayOf(day, true) : monthDay(day)
      return {
        id: m.meetingId,
        title: m.title,
        to: `/${MEETINGS_ID}/${m.meetingId}?${new URLSearchParams({ at: m.recurrenceId })}`,
        lead: `${said} ${clockTime(at, timeZone)}`,
        upcoming: true,
      }
    }),
    isPending: coming.isPending,
    isError: coming.isError,
    retry: () => void coming.refetch(),
  }
}
