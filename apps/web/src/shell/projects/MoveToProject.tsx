import type { ObjectType, ProjectId } from '@ctws/contracts'
import { idFrom, projectId as projectIdSchema } from '@ctws/contracts'
import { PickThing } from '../search/PickThing'

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
    <PickThing
      of={of}
      title={`Move “${title}” to`}
      only="project"
      leaveOut={[from]}
      busy={busy}
      error={error}
      onPick={(to) => onPick(idFrom(projectIdSchema, to.id))}
      onClose={onClose}
    />
  )
}
