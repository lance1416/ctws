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
export const BODY_GUTTER = '[--gutter:8px] sm:[--gutter:14px]'

/** No `@container`: nothing asks a list for its width. */
export const ROW_LIST = 'flex flex-col'

/**
 * The 3px project strand, full height so a run of one project's rows reads as one strand. Never
 * the only carrier: six hues are shared by more projects, so the name is always shown too.
 */
export function ProjectRail({ projectId }: { projectId: string | null }) {
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
