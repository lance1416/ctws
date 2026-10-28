import type { ProjectId } from '@ctws/contracts'
import { useProjectRail } from '../projects/projectColor'

/**
 * Every list lays a row out with the same parts at the same x:
 *
 *   [margin][thread][marker][title ................................][note]
 *                           [where it came from]
 *
 * Only the body after the thread is indented, hovered and selected, so a deep tree's dates and
 * threads still read as one column.
 */

/** A row body whose gutter is 14px at every width: Today's rows, Done today and Completed. */
export const ROW_BODY_WIDE = 'flex min-w-0 flex-1 pl-[var(--gutter)] [--gutter:14px]'

/**
 * The 3px project strand, full height so a run of one project's rows reads as one strand. Never
 * the only carrier: six hues are shared by more projects, so the name is always shown too.
 */
export function ProjectRail({ projectId }: { projectId: ProjectId | null }) {
  const rail = useProjectRail()
  return (
    <span
      aria-hidden="true"
      data-thread
      data-project-rail={projectId ?? undefined}
      // A thing in no project keeps its strand, in the hairline's colour.
      className={`pointer-events-none w-[3px] shrink-0 self-stretch ${
        projectId ? rail(projectId) : 'bg-line'
      }`}
    />
  )
}
