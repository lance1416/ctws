import type { PersonResponse } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { problemText } from '../../../platform/http/api'
import { DangerAction, DangerZone } from '../../../platform/ui/DangerZone'
import { DetailPane } from '../../../platform/ui/DetailPane'
import { BackHead } from '../../../shell/detail/BackHead'
import { useDestroy } from '../../../shell/detail/useDestroy'
import { LinkedSection } from '../../../shell/links/Links'
import { useRecordRecent } from '../../../shell/search/recent'
import { deletePerson, patchPerson } from '../api'
import { PersonForm } from './PersonForm'
import { PersonRead } from './PersonRead'

/**
 * ONE PERSON, in the shell's detail pane: read, or edited behind Edit; then what links to them,
 * and last, the delete.
 */
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

  return (
    <DetailPane label="People" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <BackHead to="/people" label="People" onClose={onClose} />
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
          />
        ) : (
          <PersonRead person={person} onEdit={() => setEditing(true)} />
        )}
      </div>
      {/* What links to them -- the meetings they are in, what they recommended. The edges are the
          shell's, so they sit beside this module's fields, not inside them. */}
      <LinkedSection of={{ type: 'person', id: person.id }} className="mt-4" />
      <DangerZone>
        <DeletePerson person={person} onDeleted={onClose} />
      </DangerZone>
    </DetailPane>
  )
}

/** Destroying this person: last in the pane, under a rule, asked once. */
function DeletePerson({ person, onDeleted }: { person: PersonResponse; onDeleted: () => void }) {
  const drop = useDestroy({
    type: 'person',
    id: person.id,
    remove: () => deletePerson(person.id),
    awaits: [['people']],
    onDone: onDeleted,
  })
  return (
    <DangerAction
      label="Delete person"
      confirmLabel="Confirm deleting this person"
      message={`Delete “${person.name}”? This cannot be undone.`}
      busy={drop.isPending}
      onConfirm={() => drop.mutate()}
    />
  )
}
