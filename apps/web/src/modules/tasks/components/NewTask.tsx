import type { ProjectId } from '@ctws/contracts'
import { inboxOf, useProjects } from '../../../shell/projects'
import { CreateTaskDialog } from './CreateTaskDialog'

/** `N T` from anywhere: a task in the project the page is on, else in the inbox (FR-026). */
export function NewTask({
  projectId,
  onClose,
}: {
  projectId: ProjectId | null
  onClose: () => void
}) {
  const projects = useProjects()
  const into = projectId ?? (projects.data ? inboxOf(projects.data)?.id : undefined)
  if (!into) return null
  return <CreateTaskDialog projectId={into} onClose={onClose} />
}
