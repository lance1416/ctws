import type { PersonId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import type { OwnThings } from '../../../shell/contract'
import { readingQuery } from '../api'
import { READING_STATUS_LABEL, readingLabel } from '../logic/item'
import { KIND_ICON, LinkIcon } from '../../../platform/ui/icons'
import { byline } from '../components/ReadingCard'

/** What a person recommended (FR-061), each with where it stands: "Reading", "To read". */
export function useRecommendedBy(personId: PersonId): OwnThings {
  const reading = useQuery(readingQuery())
  return {
    things: (reading.data ?? [])
      .filter((item) => item.recommendedBy?.id === personId)
      .map((item) => ({
        id: item.id,
        title: readingLabel(item),
        mark:
          item.kind === 'book' ? (
            <KIND_ICON.reading size={16} aria-label="Book" />
          ) : (
            <LinkIcon size={16} aria-label="Link" />
          ),
        sub: byline(item),
        trail: (
          <span
            className={`inline-flex h-5.5 shrink-0 items-center rounded-control px-2 text-meta font-medium ${
              item.status === 'reading' ? 'bg-reading-bg text-reading-t' : 'bg-hover text-muted'
            }`}
          >
            {READING_STATUS_LABEL[item.status]}
          </span>
        ),
      })),
    isPending: reading.isPending,
    isError: reading.isError,
    retry: () => void reading.refetch(),
  }
}
