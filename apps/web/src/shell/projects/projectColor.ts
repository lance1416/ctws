import type { ProjectColor } from '@ctws/contracts'
import { useEveryProject } from './api'

/**
 * The six project slots. The slot is stored on the project, from the first free one, rather than
 * hashed from its id: six buckets and four projects collide 72% of the time. Each names a
 * `--color-project-N` token, whose hex differs between light and dark.
 */
const RAIL: Record<ProjectColor, string> = {
  'project-1': 'bg-project-1',
  'project-2': 'bg-project-2',
  'project-3': 'bg-project-3',
  'project-4': 'bg-project-4',
  'project-5': 'bg-project-5',
  'project-6': 'bg-project-6',
}

/** Before the list loads, or for a project not in it: neutral, as a wrong colour would flicker. */
const UNKNOWN_RAIL = 'bg-rule'

/** A lookup, not a template: Tailwind only emits classes it can see. */
export function railClass(color: ProjectColor | undefined): string {
  return color ? RAIL[color] : UNKNOWN_RAIL
}

/** `(projectId) => class`, for places that hold a project id and not the project. */
export function useProjectRail(): (projectId: string) => string {
  // Live and archived both: a row on an archived project keeps its colour (the shelf, a search).
  const { data } = useEveryProject()
  const byId = new Map(data?.map((p) => [p.id, p.color]) ?? [])
  return (projectId) => railClass(byId.get(projectId))
}
