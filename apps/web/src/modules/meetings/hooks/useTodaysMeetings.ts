import { useQuery } from '@tanstack/react-query'
import { ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { useTimeZone } from '../../../shell/auth'
import { meetingsQuery } from '../api'

/** Today's meetings, shared by Things' count and status line. */
export function useTodaysMeetings() {
  const day = ymd(useNow(), useTimeZone())
  return useQuery(meetingsQuery({ from: day, to: day }))
}

/** "2 today", for Things' count and the Workbench card's corner; null until loaded. */
export function useTodayCount(): string | null {
  const today = useTodaysMeetings()
  return today.data ? `${today.data.length} today` : null
}
