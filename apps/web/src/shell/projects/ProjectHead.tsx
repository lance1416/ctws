import type { ProjectId } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { updateProject, useEveryProject } from './api'
import { useRegistry } from '../registry'
import { Button } from '../../platform/ui/Button'
import { ProjectIdentity } from './ProjectIdentity'

/** The head of a project's page: its name and colour, and each module's numbers about it. */
export function ProjectHead({ id }: { id: ProjectId }) {
  const registry = useRegistry()
  // Live or archived: an archived project still has its page, marked as such.
  const projects = useEveryProject()
  const project = projects.data?.find((p) => p.id === id)
  if (!project) {
    return projects.isSuccess ? (
      <p className="text-sm text-ink-muted">This project is not here any more.</p>
    ) : null
  }
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <ProjectIdentity projectId={id} name={project.name} color={project.color} />
        {project.archivedAt && (
          <p data-project-archived className="mt-1.5 text-sm font-semibold text-ink-muted">
            Archived
          </p>
        )}
        {registry.projectHeadlines.map(({ moduleId, Component }) => (
          <Component key={moduleId} projectId={id} />
        ))}
      </div>
      {/* The inbox is where capture lands, and the server refuses to archive it. */}
      {!project.isInbox && <ArchiveToggle id={id} archived={project.archivedAt !== null} />}
    </div>
  )
}

/**
 * Archive hides a project from the rail and live lists but keeps everything. It is undone in one
 * press, so it sits in the head; only what cannot be undone goes at the foot with Delete.
 */
function ArchiveToggle({ id, archived }: { id: ProjectId; archived: boolean }) {
  const toggle = useMutation({
    mutationFn: () => updateProject(id, { archived: !archived }),
    meta: { awaits: [['projects']], ownsError: true },
  })
  return (
    <div className="mt-1 flex shrink-0 flex-col items-end">
      <Button
        look="quiet"
        onClick={() => toggle.mutate()}
        disabled={toggle.isPending}
        className="whitespace-nowrap"
      >
        {archived ? 'Unarchive' : 'Archive'}
      </Button>
      {toggle.isError && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {archived ? "Couldn't unarchive." : "Couldn't archive."} Try again.
        </p>
      )}
    </div>
  )
}
