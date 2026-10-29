import type { LinkCandidate, ObjectType, ProjectId, TaskId } from '@ctws/contracts'
import { idFrom, projectId as projectIdSchema } from '@ctws/contracts'
import { PickThing } from '../search/PickThing'
import { useRegistry } from '../registry'
import { InboxIcon } from '../../platform/ui/icons'
import { inboxOf, useProjects } from './api'

/** Where a parent was picked: its project, by name too, and itself. */
export type PickedParent = {
  project: { id: ProjectId; name: string }
  parent: { id: TaskId; title: string }
}

/**
 * MOVE TO… (FR-059): the link picker (FR-024, FR-027), offering projects only and never the one
 * the thing is in. Picking one is the whole act: no line of why is asked. A project with parents
 * ends in "›" when `onPickParent` is given: its parents are the second step, in the same box. A
 * task out of the inbox can go back to it: the Inbox is the last row, under a line, no "›".
 */
export function MoveToProject({
  of,
  title,
  from = null,
  at = null,
  first = null,
  height = 1,
  busy,
  error,
  onPick,
  onPickParent,
  onClose,
}: {
  /** What is moved; null when it is not made yet (a captured line). */
  of: { type: ObjectType; id: string } | null
  title: string
  /** The project it is in now, which is not offered. */
  from?: ProjectId | null
  /**
   * The project it is in now, offered still (another parent there); said so the Inbox, its way
   * back, is not offered to what is in the inbox already (BUG-073).
   */
  at?: ProjectId | null
  /** A project offered first, before what the words find (the capture's Inbox). */
  first?: ProjectId | null
  /** How many levels it takes with what is under it, so no parent offered is too deep. */
  height?: number
  busy: boolean
  error: string | null
  onPick: (to: ProjectId) => void
  onPickParent?: (picked: PickedParent) => void
  onClose: () => void
}) {
  const parents = useRegistry().projectParents
  const projects = useProjects().data ?? []
  const project = (thing: LinkCandidate) => idFrom(projectIdSchema, thing.id)
  const inbox = inboxOf(projects)
  const back =
    of?.type === 'task' && inbox && inbox.id !== (from ?? at)
      ? {
          id: inbox.id,
          mark: <InboxIcon size={16} aria-hidden="true" className="text-muted" />,
        }
      : null
  return (
    <PickThing
      of={of}
      title={title}
      only="project"
      leaveOut={[...(from ? [from] : []), ...(inbox && !back && !first ? [inbox.id] : [])]}
      first={first}
      last={back}
      busy={busy}
      error={error}
      onPick={(to) => onPick(project(to))}
      onClose={onClose}
      {...(parents && onPickParent
        ? {
            drill: {
              into: (thing) => parents.has(projects.find((p) => p.id === thing.id)),
              step: (thing, back, close) => (
                <parents.Step
                  project={{ id: project(thing), name: thing.title }}
                  height={height}
                  moving={of?.type === 'task' ? (of.id as TaskId) : null}
                  busy={busy}
                  error={error}
                  onPick={(parent) =>
                    onPickParent({ project: { id: project(thing), name: thing.title }, parent })
                  }
                  back={back}
                  close={close}
                />
              ),
            },
          }
        : {})}
    />
  )
}
