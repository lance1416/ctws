import type { ObjectType, ProjectId } from '@ctws/contracts'
import { idFrom, projectId as projectIdSchema } from '@ctws/contracts'
import { SearchDialog } from '../search/SearchDialog'

/**
 * MOVE TO… (FR-059): the link picker (FR-024, FR-027), offering projects only and never the one
 * the thing is in. Picking one is the whole act: no line of why is asked.
 */
export function MoveToProject({
  of,
  title,
  from,
  busy,
  error,
  onPick,
  onClose,
}: {
  of: { type: ObjectType; id: string }
  title: string
  /** The project it is in now, which is not offered. */
  from: ProjectId
  busy: boolean
  error: string | null
  onPick: (to: ProjectId) => void
  onClose: () => void
}) {
  return (
    <SearchDialog
      onClose={onClose}
      pick={{
        of,
        title: `Move “${title}” to`,
        only: 'project',
        asksWhy: false,
        leaveOut: [from],
        busy,
        error,
        onPick: (to) => onPick(idFrom(projectIdSchema, to.id)),
      }}
    />
  )
}
