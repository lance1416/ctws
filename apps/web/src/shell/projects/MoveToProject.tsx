import type { LinkCandidate, ObjectType, ProjectId } from '@ctws/contracts'
import type { ReactNode } from 'react'
import { idFrom, projectId as projectIdSchema } from '@ctws/contracts'
import { PickThing } from '../search/PickThing'

/**
 * MOVE TO… (FR-059): the link picker (FR-024, FR-027), offering projects only and never the one
 * the thing is in. Picking one is the whole act: no line of why is asked. A project with somewhere
 * further to go ends in "›": `inside` draws that second step, in the same box.
 */
export function MoveToProject({
  of,
  title,
  from,
  busy,
  error,
  onPick,
  onClose,
  inside,
}: {
  of: { type: ObjectType; id: string }
  title: string
  /** The project it is in now, which is not offered. */
  from: ProjectId
  busy: boolean
  error: string | null
  onPick: (to: ProjectId) => void
  onClose: () => void
  inside?: {
    has: (project: ProjectId) => boolean
    step: (project: { id: ProjectId; name: string }, back: () => void) => ReactNode
  }
}) {
  const project = (thing: LinkCandidate) => idFrom(projectIdSchema, thing.id)
  return (
    <PickThing
      of={of}
      title={`Move “${title}” to`}
      only="project"
      leaveOut={[from]}
      busy={busy}
      error={error}
      onPick={(to) => onPick(project(to))}
      onClose={onClose}
      {...(inside
        ? {
            drill: {
              into: (thing) => inside.has(project(thing)),
              step: (thing, back) => inside.step({ id: project(thing), name: thing.title }, back),
            },
          }
        : {})}
    />
  )
}
