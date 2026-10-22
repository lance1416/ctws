import { avatarInitials, currentRole } from '@ctws/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { SearchHit } from '../../../shell/contract'
import { PersonFact, PersonMark } from '../components/PersonFacts'
import { birthdayCalendarQuery, personSearchQuery } from '../api'
import { PEOPLE_ID } from '../logic/id'

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

export function usePeopleHits(query: string) {
  const results = useQuery({
    ...personSearchQuery(query),
    enabled: query.length > 0,
  })
  const hits: SearchHit[] = (results.data ?? []).map((person) => {
    // Drawn as the link picker draws a person, so the two lists cannot disagree.
    const thing = {
      type: 'person' as const,
      id: person.id,
      title: person.name,
      initials: avatarInitials(person),
      org: currentRole(person.roles)?.organisationName ?? null,
    }
    return {
      id: person.id,
      type: 'person',
      to: `/${PEOPLE_ID}/${person.id}`,
      title: person.name,
      meta: <PersonFact thing={thing} />,
      mark: <PersonMark thing={thing} />,
    }
  })
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}
