import {
  idFrom,
  personId,
  projectId,
  type CreatePersonBody,
  type PersonResponse,
} from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { problemText } from '../../../platform/http/api'
import { DangerZone } from '../../../platform/ui/DangerZone'
import { DeletedNotice } from '../../../shell/detail'
import { useSubjectOf } from '../../../shell/layout'
import { useForgetWhenGone, useRecordRecent } from '../../../shell/search'
import { createPerson, patchPerson, peopleKeys, peopleQuery, putRoles } from '../api'
import { DeletePerson } from '../components/DeletePerson'
import { PersonEditor, type PersonWrite } from '../components/PersonEditor'
import { PersonPage } from './PersonPage'

/** The person the address names, or that there is no such person. */
function useAddressed(): {
  person: PersonResponse | undefined
  id: string | undefined
  gone: boolean
} {
  const { id } = useParams()
  const people = useQuery(peopleQuery())
  const person = id ? people.data?.find((p) => p.id === idFrom(personId, id)) : undefined
  return { person, id, gone: people.isSuccess && !person }
}

/** `/people/:id`: their page (FR-061), or what happened to them (artboard 23). */
export function Person() {
  const { person, id, gone } = useAddressed()
  useForgetWhenGone('person', id ?? null, gone)
  useSubjectOf(person ? { type: 'person', id: person.id, title: person.name } : null)
  useRecordRecent(
    person
      ? {
          type: 'person',
          id: person.id,
          title: person.name,
          to: `/people/${person.id}`,
          kind: 'Person',
        }
      : null,
  )
  if (gone && id) return <DeletedNotice type="person" id={id} />
  if (!person) return null
  return <PersonPage key={person.id} person={person} />
}

/** Writes a person, then their roles as a list of their own (FR-047), then opens their page. */
function useWritePerson(person: PersonResponse | null) {
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async (write: PersonWrite) => {
      const saved = person
        ? await patchPerson(person.id, write.body)
        : await createPerson(write.body as CreatePersonBody)
      if (write.rolesChanged) await putRoles(saved.id, await write.roles())
      return saved
    },
    meta: { changes: ['person', 'organisation'], awaits: [peopleKeys.all], ownsError: true },
    onSuccess: (saved) => navigate(`/people/${saved.id}`),
  })
}

/** `/people/new`: someone written down in full, in the main area (FR-062). */
export function PersonNew() {
  const [params] = useSearchParams()
  const project = params.get('project')
  const write = useWritePerson(null)
  return (
    <PersonEditor
      person={null}
      projectId={project ? idFrom(projectId, project) : null}
      busy={write.isPending}
      error={write.isError ? problemText(write.error) : null}
      cancelTo={project ? `/projects/${project}` : '/people'}
      onSubmit={(w) => write.mutate(w)}
    />
  )
}

/** `/people/:id/edit`: the same form, filled, and delete at its foot (FR-063). */
export function PersonEdit() {
  const { person, id, gone } = useAddressed()
  const navigate = useNavigate()
  const write = useWritePerson(person ?? null)
  if (gone && id) return <DeletedNotice type="person" id={id} />
  if (!person) return null
  return (
    <PersonEditor
      key={person.id}
      person={person}
      busy={write.isPending}
      error={write.isError ? problemText(write.error) : null}
      cancelTo={`/people/${person.id}`}
      onSubmit={(w) => write.mutate(w)}
    >
      <DangerZone>
        <DeletePerson person={person} onDeleted={() => navigate('/people')} />
      </DangerZone>
    </PersonEditor>
  )
}
