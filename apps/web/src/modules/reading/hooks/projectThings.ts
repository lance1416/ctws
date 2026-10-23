import type { ProjectId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import type { OwnThings } from '../../../shell/contract'
import { readingQuery } from '../api'
import { readingLabel } from '../logic/item'

/** A project's reading (FR-055), by the name each goes by. */
export function useProjectReading(projectId: ProjectId): OwnThings {
  const reading = useQuery(readingQuery())
  return {
    things: (reading.data ?? [])
      .filter((item) => item.projectId === projectId)
      .map((item) => ({ id: item.id, title: readingLabel(item), fact: item.author })),
    isPending: reading.isPending,
    isError: reading.isError,
    retry: () => void reading.refetch(),
  }
}
