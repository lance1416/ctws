import type { PersonResponse } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { problemText } from '../../../platform/http/api'
import { DangerAction, DangerZone } from '../../../platform/ui/DangerZone'
import { DetailPane } from '../../../platform/ui/DetailPane'
import { UnsavedAsk } from '../../../platform/ui/UnsavedAsk'
import { useUnsavedGuard } from '../../../platform/ui/unsavedGuard'
import { BackHead, useDestroy } from '../../../shell/detail'
import { LinkedSection } from '../../../shell/links'
import { useRecordRecent } from '../../../shell/search'
import { deletePerson, patchPerson } from '../api'
import { PersonForm } from './PersonForm'
import { PersonRead } from './PersonRead'

export function PersonDetail({ person, onClose }: { person: PersonResponse; onClose: () => void }) {
  useRecordRecent({
    type: 'person',
    id: person.id,
    title: person.name,
    to: `/people/${person.id}`,
    kind: 'Person',
  })
  const [editing, setEditing] = useState(false)
  // Waits for the list, so the reading that replaces the form already shows the edit.
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof patchPerson>[1]) => patchPerson(person.id, patch),
    meta: { awaits: [['people']] },
  })
  // Escape, the scrim and the close button ask first when the form has unsaved changes.
  const [unsaved, setUnsaved] = useState(false)
  const guard = useUnsavedGuard(unsaved)
  const requestClose = () => guard.leave(onClose)

  return (
    <DetailPane label="People" onClose={requestClose}>
      <div className="flex flex-col gap-4">
        <BackHead to="/people" label="People" onClose={requestClose} />
        <UnsavedAsk guard={guard} />
        {editing ? (
          <PersonForm
            person={person}
            busy={save.isPending}
            error={problemText(save.error)}
            onCancel={() => {
              save.reset()
              setEditing(false)
            }}
            onSave={(patch) => save.mutate(patch, { onSuccess: () => setEditing(false) })}
            onUnsaved={setUnsaved}
          />
        ) : (
          <PersonRead person={person} onEdit={() => setEditing(true)} />
        )}
      </div>
      <LinkedSection of={{ type: 'person', id: person.id }} className="mt-4" />
      <DangerZone>
        <DeletePerson person={person} onDeleted={onClose} />
      </DangerZone>
    </DetailPane>
  )
}

function DeletePerson({ person, onDeleted }: { person: PersonResponse; onDeleted: () => void }) {
  const drop = useDestroy({
    type: 'person',
    id: person.id,
    remove: () => deletePerson(person.id),
    awaits: [['people']],
    onDone: onDeleted,
  })
  return (
    <>
      <DangerAction
        label="Delete person"
        confirmLabel="Confirm deleting this person"
        message={`Delete “${person.name}”? This cannot be undone.`}
        busy={drop.isPending}
        onConfirm={() => drop.mutate()}
      />
      {drop.isError && (
        <p role="alert" className="text-sm text-danger">
          {problemText(drop.error)}
        </p>
      )}
    </>
  )
}
