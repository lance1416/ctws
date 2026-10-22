import type { ProjectId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import type { ProjectThings } from '../../../shell/contract'
import { peopleQuery } from '../api'

/** The people on a project (FR-055), with where each works now. */
export function useProjectPeople(projectId: ProjectId): ProjectThings {
  const people = useQuery(peopleQuery())
  return {
    things: (people.data ?? [])
      .filter((p) => p.projects.some((project) => project.id === projectId))
      .map((p) => ({ id: p.id, title: p.name, fact: p.org })),
    isPending: people.isPending,
    isError: people.isError,
    retry: () => void people.refetch(),
  }
}
