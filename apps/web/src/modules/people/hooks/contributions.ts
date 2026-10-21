import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { SearchHit } from '../../../shell/contract'
import { birthdayCalendarQuery, personSearchQuery } from '../api'
import { PEOPLE_ID } from '../logic/id'

/** No `opens`: a birthday's entry links to its person's page. */
export function useBirthdayEntries(range: { from: string; to: string }) {
  // The month stepped away from stays drawn until the next one is in.
  const result = useQuery({ ...birthdayCalendarQuery(range), placeholderData: keepPreviousData })
  return { entries: result.data ?? [], isError: result.isError }
}

export function usePeopleHits(query: string) {
  const results = useQuery({
    ...personSearchQuery(query),
    enabled: query.length > 0,
  })
  const hits: SearchHit[] = (results.data ?? []).map((person) => ({
    id: person.id,
    type: 'person',
    to: `/${PEOPLE_ID}/${person.id}`,
    title: person.name,
    // One fact in the column (FR-010): where they work, else their first project.
    meta: person.org ?? person.projects[0]?.name ?? person.channels[0]?.value ?? null,
    mark: null,
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}
