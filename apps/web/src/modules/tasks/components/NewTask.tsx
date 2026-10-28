import type { ObjectType, ProjectId } from '@ctws/contracts'
import { inboxOf, useProjects } from '../../../shell/projects'
import { CreateTaskDialog } from './CreateTaskDialog'

/**
 * `N T` from anywhere: a task in the project the page is on, else in the inbox (FR-026). Made from
 * a person's page, it is related to them (FR-061, N-05). From a day on the calendar, it is planned
 * for that day (FR-080).
 */
export function NewTask({
  projectId,
  about,
  onClose,
  day,
}: {
  projectId: ProjectId | null
  about: { type: ObjectType; id: string } | null
  onClose: () => void
  day: string | null
}) {
  const projects = useProjects()
  const into = projectId ?? (projects.data ? inboxOf(projects.data)?.id : undefined)
  if (!into) return null
  return (
    <CreateTaskDialog
      projectId={into}
      relatedTo={about && about.type !== 'project' ? { type: about.type, id: about.id } : null}
      scheduledOn={day}
      onClose={onClose}
    />
  )
}
