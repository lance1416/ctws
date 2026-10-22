import { addDays } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import { calendarDaysQuery } from './api'

/**
 * A day's lunar name with its month (Today's head, FR-079): "九月十三". The server names a day by
 * itself except on its month's first ("九月初一"), so the month is the latest first day's.
 */
export function lunarFullName(days: Record<string, string>, day: string): string | null {
  const own = days[day]
  if (!own) return null
  if (own.includes('月')) return own
  const first = Object.keys(days)
    .filter((d) => d <= day && days[d]!.endsWith('初一'))
    .sort()
    .at(-1)
  return first ? `${days[first]!.replace(/初一$/, '')}${own}` : null
}

/** `lunarFullName` for one day, asking for the month before it (a lunar month is at most 30). */
export function useLunarName(day: string): string | null {
  const window = useQuery(calendarDaysQuery({ from: addDays(day, -30), to: day }))
  return window.data ? lunarFullName(window.data, day) : null
}
