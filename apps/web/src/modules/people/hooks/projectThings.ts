import type { ProjectId } from '@ctws/contracts'
import { avatarInitials } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import type { ProjectThings } from '../../../shell/contract'
import { peopleQuery } from '../api'

/** The people on a project (FR-055): each by their avatar and name, with where they work now. */
export function useProjectPeople(projectId: ProjectId): ProjectThings {
  const people = useQuery(peopleQuery())
  return {
    things: (people.data ?? [])
      .filter((p) => p.projects.some((project) => project.id === projectId))
      .map((p) => ({ id: p.id, title: p.name, initials: avatarInitials(p), fact: p.org })),
    isPending: people.isPending,
    isError: people.isError,
    retry: () => void people.refetch(),
  }
}
