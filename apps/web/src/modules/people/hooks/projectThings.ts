import type { PersonId, ProjectId } from '@ctws/contracts'
import { avatarInitials } from '@ctws/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { OwnThings } from '../../../shell/contract'
import { patchPerson, peopleKeys, peopleQuery } from '../api'
import { PEOPLE_ID } from '../logic/id'

/**
 * The people on a project (FR-055): each by their avatar and name, with where they work now. Who
 * is on a project is changed here only: someone already written down is put on it or taken off,
 * and someone new is written down on it.
 */
export function useProjectPeople(projectId: ProjectId): OwnThings {
  const navigate = useNavigate()
  const people = useQuery(peopleQuery())
  const all = people.data ?? []
  const on = all.filter((p) => p.projects.some((project) => project.id === projectId))
  const move = useMutation({
    mutationFn: ({ id, onIt }: { id: string; onIt: boolean }) => {
      const was = all.find((p) => p.id === id)?.projects.map((p) => p.id) ?? []
      const projectIds = onIt
        ? [...was.filter((p) => p !== projectId), projectId]
        : was.filter((p) => p !== projectId)
      return patchPerson(id as PersonId, { projectIds })
    },
    meta: { changes: ['person', 'project'], awaits: [peopleKeys.all], ownsError: true },
  })
  return {
    things: on.map((p) => ({
      id: p.id,
      title: p.name,
      initials: avatarInitials(p),
      fact: p.org,
    })),
    isPending: people.isPending,
    isError: people.isError,
    retry: () => void people.refetch(),
    join: {
      add: (id) => move.mutate({ id, onIt: true }),
      remove: (id) => move.mutate({ id, onIt: false }),
      // Written down in full on their own page, then back to the project (FR-026).
      make: (name) => navigate(`/${PEOPLE_ID}/new?project=${projectId}`, { state: { name } }),
      busy: move.isPending,
      error: move.isError
        ? move.variables.onIt
          ? 'Couldn’t put them on the project. Try again.'
          : 'Couldn’t take them off the project. Try again.'
        : null,
    },
  }
}
