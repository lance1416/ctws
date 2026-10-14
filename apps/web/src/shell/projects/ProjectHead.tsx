import { useMutation } from '@tanstack/react-query'
import { updateProject, useEveryProject } from './api'
import { useRegistry } from '../registry'
import { BUTTON } from '../../platform/ui/buttonStyles'
import { ProjectIdentity } from './ProjectIdentity'

/**
 * A PROJECT'S OWN FIELDS, at the head of its page: its name and colour, and the numbers each
 * module keeps about it.
 *
 * The SHELL's, not a module's -- a project is one kind of object among five now, but it is still
 * the organising dimension the user's life runs in, so nobody else owns it. The numbers beside
 * the name come from the registry: a banner that imported the task module's counts would be a
 * banner no second module could ever appear in.
 */
export function ProjectHead({ id }: { id: string }) {
  const registry = useRegistry()
  // Live or archived: an archived project's page is its page, marked as set aside.
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
        {/* The chip is the colour PICKER and the name is editable in place. The chip is never
            alone -- the name is right beside it (WCAG 1.4.1). */}
        <ProjectIdentity projectId={id} name={project.name} color={project.color} />
        {project.archivedAt && (
          <p data-project-archived className="mt-1.5 text-sm font-semibold text-ink-muted">
            Archived
          </p>
        )}
        {/* Each module's numbers, said as a sentence under the name. */}
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
 * SET ASIDE, AND BACK. Archive takes a line of work out of the rail, Today and the live lists, and
 * keeps it -- its tasks, its links, its page. It is undone in one press, so it lives in the head
 * beside the name, not at the foot with Delete, where only what cannot be undone goes. The page
 * stays open on it, marked Archived, with Unarchive where Archive was.
 */
function ArchiveToggle({ id, archived }: { id: string; archived: boolean }) {
  const toggle = useMutation({
    mutationFn: () => updateProject(id, { archived: !archived }),
    meta: { awaits: [['projects']] },
  })
  return (
    <div className="mt-1 flex shrink-0 flex-col items-end">
      <button
        type="button"
        onClick={() => toggle.mutate()}
        disabled={toggle.isPending}
        className={`whitespace-nowrap ${BUTTON.quiet}`}
      >
        {archived ? 'Unarchive' : 'Archive'}
      </button>
      {toggle.isError && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {archived ? "Couldn't unarchive." : "Couldn't archive."} Try again.
        </p>
      )}
    </div>
  )
}
