import { useQuery } from '@tanstack/react-query'
import { meetingCalendarQuery } from '../api'

export function useMeetingEntries(range: { from: string; to: string }) {
  const result = useQuery(meetingCalendarQuery(range))
  return { entries: result.data ?? [], isError: result.isError }
}
