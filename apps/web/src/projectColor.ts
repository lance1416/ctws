import type { ProjectColor } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { listProjects } from './api/projects'

/**
 * The project identity rail: which of the six categorical slots a project wears.
 *
 * IT IS STORED ON THE PROJECT, assigned once by the server from the first free slot. It used to be
 * derived here by hashing the project id into six buckets -- stable per project, which was the
 * point, but stable and RANDOM: six buckets and four projects collide 72% of the time, and the
 * user's four projects duly drew three colours, which is the report that started this. The first
 * six projects are now distinct by construction.
 *
 * The slot names a `--color-project-N` token rather than a colour, because the six hexes differ
 * between light and dark (see the block in styles.css): a stored colour could only be right in one
 * of the two schemes.
 */
const RAIL: Record<ProjectColor, string> = {
  'project-1': 'bg-project-1',
  'project-2': 'bg-project-2',
  'project-3': 'bg-project-3',
  'project-4': 'bg-project-4',
  'project-5': 'bg-project-5',
  'project-6': 'bg-project-6',
}

/**
 * What a rail wears before the project list has loaded, or for a project that is not in it (an
 * archived one referenced by a task). A neutral hairline, not a guessed colour: the chip is
 * decorative -- it never carries meaning without the project's name beside it (WCAG 1.4.1) -- so
 * showing no colour for a moment is honest, where showing the wrong one and correcting it is a
 * visible flicker that teaches the user the colours are not reliable.
 */
const UNKNOWN_RAIL = 'bg-border-subtle'

/** A Tailwind class for a slot. A lookup, not a template: Tailwind only emits classes it can see. */
export function railClass(color: ProjectColor | null | undefined): string {
  return color ? RAIL[color] : UNKNOWN_RAIL
}

/**
 * `(projectId) => class`, for the many places that hold a task's project id and not the project.
 *
 * It reads the same `['projects']` cache entry every screen already subscribes to, so it costs no
 * extra request; on a screen that did not fetch the list, it is the fetch that was going to be
 * needed anyway.
 */
export function useProjectRail(): (projectId: string) => string {
  const { data } = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const byId = new Map(data?.map((p) => [p.id, p.color]) ?? [])
  return (projectId) => railClass(byId.get(projectId))
}
