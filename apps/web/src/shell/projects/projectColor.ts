import { type ProjectColor, type ProjectId } from '@ctws/contracts'
import { useEveryProject } from './api'

/**
 * The eight project colours (tokens.md). The colour is stored on the project, chosen by the server
 * from those not yet used, rather than hashed from its id: buckets collide. Each names a
 * `--color-project-<name>` token, the same hex in light and dark.
 */
const RAIL: Record<ProjectColor, string> = {
  blue: 'bg-project-blue',
  amber: 'bg-project-amber',
  green: 'bg-project-green',
  violet: 'bg-project-violet',
  red: 'bg-project-red',
  olive: 'bg-project-olive',
  teal: 'bg-project-teal',
  pink: 'bg-project-pink',
}

/** Before the list loads, or for a project not in it: neutral, as a wrong colour would flicker. */
const UNKNOWN_RAIL = 'bg-line'

/** A lookup, not a template: Tailwind only emits classes it can see. */
export function squareClass(color: ProjectColor | undefined): string {
  return color ? RAIL[color] : UNKNOWN_RAIL
}

/** `(projectId) => class`, for places that hold a project id and not the project. */
export function useProjectRail(): (projectId: ProjectId) => string {
  // Live and archived both: a row on an archived project keeps its colour (the shelf, a search).
  const { data } = useEveryProject()
  const byId = new Map(data?.map((p) => [p.id, p.color]) ?? [])
  return (projectId) => squareClass(byId.get(projectId))
}
