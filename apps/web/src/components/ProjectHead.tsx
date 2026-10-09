import { useQuery } from '@tanstack/react-query'
import { listProjects } from '../api/projects'
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
  // Same query function as every other reader of ['projects']: they share one cache entry, so
  // they must agree on its shape.
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const project = projects.data?.find((p) => p.id === id)
  if (!project) {
    return projects.isSuccess ? (
      <p className="text-sm text-fg-muted">This project is not here any more.</p>
    ) : null
  }
  return (
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-8 gap-y-3">
      {/* The chip is the colour PICKER and the name is editable in place. The chip is never
          alone -- the name is right beside it (WCAG 1.4.1). */}
      <ProjectIdentity projectId={id} name={project.name} color={project.color} />
      {projectHeadlines().map(({ moduleId, Component }) => (
        <Component key={moduleId} projectId={id} />
      ))}
    </div>
  )
}
