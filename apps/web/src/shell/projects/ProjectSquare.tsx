import type { ProjectResponse } from '@ctws/contracts'
import { InboxIcon } from '../../platform/ui/icons'
import { squareClass } from './projectColor'

/**
 * A project's square (FR-004): its colour, solid, with its initials in white; at least 20px. The
 * inbox is a grey square with the inbox icon instead. Always beside the project's name, or named
 * by `title` where the name is not in the row.
 */
export function ProjectSquare({
  project,
  size = 20,
  className = '',
}: {
  project: Pick<ProjectResponse, 'name' | 'color' | 'initials' | 'isInbox'>
  size?: 20 | 34
  className?: string
}) {
  const box =
    size === 34 ? 'size-8.5 rounded-card text-ui font-medium' : 'size-5 rounded-key text-initials'
  if (project.isInbox)
    return (
      <span
        aria-hidden="true"
        className={`inline-grid shrink-0 place-items-center bg-project-bg text-project ${box} ${className}`}
      >
        <InboxIcon size={size === 34 ? 18 : 12} />
      </span>
    )
  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center text-on-project ${squareClass(project.color)} ${box} ${className}`}
    >
      {project.initials}
    </span>
  )
}
