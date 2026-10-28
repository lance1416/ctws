import type { OrganisationResponse } from '@ctws/contracts'
import { problemText } from '../../../platform/http/api'
import { DangerAction } from '../../../platform/ui/DangerZone'
import { useDestroy } from '../../../shell/detail'
import { deleteOrganisation, organisationKeys } from '../api'

/** Deletes an organisation, saying first what goes with it and what stays (FR-035). */
export function DeleteOrganisation({
  organisation: o,
  onDeleted,
}: {
  organisation: OrganisationResponse
  onDeleted: () => void
}) {
  const drop = useDestroy({
    type: 'organisation',
    id: o.id,
    remove: () => deleteOrganisation(o.id),
    awaits: [organisationKeys.all],
    onDone: onDeleted,
  })
  const roles =
    o.roleCount === 0
      ? ''
      : o.roleCount === 1
        ? ' 1 person loses a role there.'
        : ` ${o.roleCount} people lose a role there.`
  return (
    <>
      <DangerAction
        label={`Delete ${o.name}`}
        confirmLabel={`Delete ${o.name}`}
        // First what goes, then what stays (FR-035).
        message={`Delete ${o.name}?${roles} Messages with it, and the tasks and meetings linked to it, stay.`}
        confirm={`Delete ${o.name}`}
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
