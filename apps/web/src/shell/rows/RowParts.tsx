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

/**
 * The body's gutter after the thread: 8px on a phone, 14px from 640 up. A CSS variable, so the
 * row, its guides and the new-task input all offset from one value (`gutterPlus`).
 */
const BODY_GUTTER = '[--gutter:8px] sm:[--gutter:14px]'

/**
 * A row's body after the thread: it takes the rest of the row and starts at the gutter, so every
 * list's markers and titles line up. A tree row sets its own `padding-left` from the gutter.
 */
export const ROW_BODY = `flex min-w-0 flex-1 pl-[var(--gutter)] ${BODY_GUTTER}`

export const ROW_LIST = 'flex flex-col'

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
        projectId ? rail(projectId) : 'bg-rule'
      }`}
    />
  )
}
