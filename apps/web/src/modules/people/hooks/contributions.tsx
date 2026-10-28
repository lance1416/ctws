import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { birthdayCalendarQuery } from '../api'

/** No `opens`: a birthday's entry links to its person's page. */
export function useBirthdayEntries(range: { from: string; to: string }) {
  // The month stepped away from stays drawn until the next one is in.
  const result = useQuery({ ...birthdayCalendarQuery(range), placeholderData: keepPreviousData })
  return {
    entries: result.data ?? [],
    isError: result.isError,
    retry: () => void result.refetch(),
  }
}
