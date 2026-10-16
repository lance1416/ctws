import type { PersonResponse } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { problemText } from '../../../platform/http/api'
import { DangerAction } from '../../../platform/ui/DangerZone'
import { ItemPane, useDestroy, useItemPane } from '../../../shell/detail'
import { deletePerson, patchPerson, peopleKeys } from '../api'
import { PersonForm } from './PersonForm'
import { PersonRead } from './PersonRead'

export function PersonDetail({ person, onClose }: { person: PersonResponse; onClose: () => void }) {
  const pane = useItemPane(onClose)
  // Waits for the list, so the reading that replaces the form already shows the edit.
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof patchPerson>[1]) => patchPerson(person.id, patch),
    meta: { changes: ['person'], awaits: [peopleKeys.all], ownsError: true },
  })

  return (
    <ItemPane
      pane={pane}
      label="People"
      back="/people"
      recent={{
        type: 'person',
        id: person.id,
        title: person.name,
        to: `/people/${person.id}`,
        kind: 'Person',
      }}
      linked={{ of: { type: 'person', id: person.id } }}
      danger={<DeletePerson person={person} onDeleted={onClose} />}
    >
      {pane.editing ? (
        <PersonForm
          person={person}
          busy={save.isPending}
          error={problemText(save.error)}
          onCancel={() => {
            save.reset()
            pane.setEditing(false)
          }}
          onSave={(patch) => save.mutate(patch, { onSuccess: () => pane.setEditing(false) })}
          onUnsaved={pane.onUnsaved}
        />
      ) : (
        <PersonRead person={person} onEdit={() => pane.setEditing(true)} />
      )}
    </ItemPane>
  )
}

function DeletePerson({ person, onDeleted }: { person: PersonResponse; onDeleted: () => void }) {
  const drop = useDestroy({
    type: 'person',
    id: person.id,
    remove: () => deletePerson(person.id),
    awaits: [peopleKeys.all],
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
