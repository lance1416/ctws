import type { LinkCandidate } from '@ctws/contracts'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { StatusMark } from './StatusMark'

/** A task listed among things of every kind: its status, in the first column. */
export function TaskMark({ thing }: { thing: LinkCandidate }) {
  return thing.type === 'task' ? <StatusMark status={thing.status} /> : null
}

/**
 * Where a task sits (DES-001 section 4, artboard 9): its project's square and the task it is under,
 * or the project's name when it is under nothing.
 */
export function TaskFact({ thing }: { thing: LinkCandidate }) {
  const projects = useEveryProject()
  if (thing.type !== 'task') return null
  const project = projects.data?.find((p) => p.id === thing.projectId)
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {project && (
        <span data-project-square={project.id} className="contents">
          <ProjectSquare project={project} />
        </span>
      )}
      <span className="truncate">{thing.parentTitle ?? thing.projectName}</span>
    </span>
  )
}
