import { useEveryProject } from '../api/projects'
import { projectHeadlines } from '../modules/registry'
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
  // Live or archived: an archived project's page is its page, marked as set aside.
  const projects = useEveryProject()
  const project = projects.data?.find((p) => p.id === id)
  if (!project) {
    return projects.isSuccess ? (
      <p className="text-sm text-ink-muted">This project is not here any more.</p>
    ) : null
  }
  return (
    <div className="flex min-w-0 flex-col">
      {/* The chip is the colour PICKER and the name is editable in place. The chip is never
          alone -- the name is right beside it (WCAG 1.4.1). */}
      <ProjectIdentity projectId={id} name={project.name} color={project.color} />
      {project.archivedAt && (
        <p data-project-archived className="mt-1.5 text-sm font-semibold text-ink-muted">
          Archived
        </p>
      )}
      {/* Each module's numbers, said as a sentence under the name. */}
      {projectHeadlines().map(({ moduleId, Component }) => (
        <Component key={moduleId} projectId={id} />
      ))}
    </div>
  )
}
