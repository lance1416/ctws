import { idFrom, personId, type PersonResponse } from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { problemText } from '../../../platform/http/api'
import { DangerZone } from '../../../platform/ui/DangerZone'
import { DeletedNotice } from '../../../shell/detail'
import { useSubjectOf } from '../../../shell/layout'
import { useForgetWhenGone, useRecordRecent } from '../../../shell/search'
import { patchPerson, peopleKeys, peopleQuery } from '../api'
import { DeletePerson } from '../components/DeletePerson'
import { PersonForm } from '../components/PersonForm'
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

/** `/people/:id/edit`: everything about them in one form, and delete at its foot. */
export function PersonEdit() {
  const { person, id, gone } = useAddressed()
  const navigate = useNavigate()
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof patchPerson>[1]) => patchPerson(person!.id, patch),
    meta: { changes: ['person'], awaits: [peopleKeys.all], ownsError: true },
    onSuccess: (saved) => navigate(`/people/${saved.id}`),
  })
  if (gone && id) return <DeletedNotice type="person" id={id} />
  if (!person) return null
  return (
    <div key={person.id} className="flex min-h-full max-w-[44rem] flex-col gap-4">
      <h1 tabIndex={-1} className="text-title tracking-[-0.02em] focus:outline-none">
        Edit {person.name}
      </h1>
      <PersonForm
        person={person}
        busy={save.isPending}
        error={problemText(save.error)}
        onCancel={() => navigate(`/people/${person.id}`)}
        onSave={(patch) => save.mutate(patch)}
      />
      <DangerZone>
        <DeletePerson person={person} onDeleted={() => navigate('/people')} />
      </DangerZone>
    </div>
  )
}
