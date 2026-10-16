import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { meetingCalendarQuery } from '../api'

export function useMeetingEntries(range: { from: string; to: string }) {
  // The month stepped away from stays drawn until the next one is in.
  const result = useQuery({ ...meetingCalendarQuery(range), placeholderData: keepPreviousData })
  return { entries: result.data ?? [], isError: result.isError }
}
