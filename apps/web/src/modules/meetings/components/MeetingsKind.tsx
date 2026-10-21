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
