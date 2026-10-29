import { useQuery } from '@tanstack/react-query'
import { addDays } from '@ctws/core/day'
import { ymd } from '../../../platform/time/dates'
import { meetingsQuery } from '../api'
import { clockTime } from '@ctws/core/clock'
import { useNow } from '../../../platform/time/useNow'
import { useTimeZone } from '../../../shell/auth'
import { useTodaysMeetings } from '../hooks/useTodaysMeetings'

/** The next meeting today, if any is still to come. */
export function NextMeetingLine() {
  const accountZone = useTimeZone()
  const today = useTodaysMeetings()
  const now = useNow()
  const next = today.data?.find((m) => new Date(m.startsAt).getTime() > now.getTime())
  if (!next) return null
  const at = clockTime(new Date(next.startsAt), accountZone)
  return (
    <span data-status>
      Next: {next.title} at {at}
    </span>
  )
}

/** What a phone's More says beside Meetings (FR-085): how many are still to come this week. */
export function MeetingsMoreCount() {
  const zone = useTimeZone()
  const now = useNow()
  const today = ymd(now, zone)
  const week = useQuery(meetingsQuery({ from: today, to: addDays(today, 6) }))
  if (!week.data) return null
  return <span data-count>{week.data.filter((m) => new Date(m.endsAt) > now).length}</span>
}
