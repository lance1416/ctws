import type { PersonResponse } from '@ctws/contracts'
import { problemText } from '../../../platform/http/api'
import { DangerAction } from '../../../platform/ui/DangerZone'
import { useDestroy } from '../../../shell/detail'
import { deletePerson, peopleKeys } from '../api'

/** Deletes a person, saying first what goes with them and what stays (FR-035). */
export function DeletePerson({
  person,
  onDeleted,
}: {
  person: PersonResponse
  onDeleted: () => void
}) {
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
        label={`Delete ${person.name}`}
        confirmLabel={`Delete ${person.name}`}
        // First what goes, then what stays (FR-035).
        message={`Delete ${person.name}? Their contact details, birthday and profile notes go. Notes about them, messages with them, and the meetings and tasks linked to them stay.`}
        confirm={`Delete ${person.name}`}
        busy={drop.isPending}
        onConfirm={() => drop.mutate()}
      />
      {drop.isError && (
        <p role="alert" className="text-ui text-stop-t">
          {problemText(drop.error)}
        </p>
      )}
    </>
  )
}
