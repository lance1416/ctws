import type { ProjectId } from '@ctws/contracts'
import { clockTime } from '@ctws/core/clock'
import { addDays } from '@ctws/core/day'
import { useQuery } from '@tanstack/react-query'
import { weekdayOf, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { useTimeZone } from '../../../shell/auth'
import type { ProjectThings } from '../../../shell/contract'
import { meetingsQuery } from '../api'
import { MEETINGS_ID } from '../logic/id'
import { nextOfEach } from '../logic/nextOfEach'

/** How far ahead a project's page looks for its meetings: the month the Meetings page shows. */
const AHEAD_DAYS = 31

/**
 * A project's meetings coming up (FR-055): each series once, at its next occurrence, said by its
 * weekday and time on the account's clock ("Thu 14:00").
 */
export function useProjectMeetings(projectId: ProjectId): ProjectThings {
  const timeZone = useTimeZone()
  const now = useNow()
  const today = ymd(now, timeZone)
  const coming = useQuery(meetingsQuery({ from: today, to: addDays(today, AHEAD_DAYS) }))
  const mine = (coming.data ?? []).filter((m) => m.projectId === projectId)
  return {
    things: nextOfEach(mine, now).map((m) => {
      const at = new Date(m.startsAt)
      return {
        id: m.meetingId,
        title: m.title,
        to: `/${MEETINGS_ID}/${m.meetingId}?${new URLSearchParams({ at: m.recurrenceId })}`,
        lead: `${weekdayOf(ymd(at, timeZone), true)} ${clockTime(at, timeZone)}`,
      }
    }),
    isPending: coming.isPending,
    isError: coming.isError,
    retry: () => void coming.refetch(),
  }
}
