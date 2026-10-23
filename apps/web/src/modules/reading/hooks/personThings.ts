import type { PersonId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import type { OwnThings } from '../../../shell/contract'
import { readingQuery } from '../api'
import { READING_STATUS_LABEL, readingLabel } from '../logic/item'

/** What a person recommended (FR-061), each with where it stands: "Reading", "To read". */
export function useRecommendedBy(personId: PersonId): OwnThings {
  const reading = useQuery(readingQuery())
  return {
    things: (reading.data ?? [])
      .filter((item) => item.recommendedBy?.id === personId)
      .map((item) => ({
        id: item.id,
        title: readingLabel(item),
        fact: READING_STATUS_LABEL[item.status],
      })),
    isPending: reading.isPending,
    isError: reading.isError,
    retry: () => void reading.refetch(),
  }
}
