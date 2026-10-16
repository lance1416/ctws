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
    to: `/${PEOPLE_ID}/${person.id}`,
    title: person.name,
    meta: [person.org, ...person.projects.map((p) => p.name), person.channels[0]?.value]
      .filter(Boolean)
      .join(' · '),
    mark: null,
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}
