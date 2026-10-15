import { useProjectRail } from '../projects/projectColor'

/**
 * THE ROW ANATOMY. Every list in the app -- Today, the project tree, Done -- lays a row out with
 * the SAME parts at the SAME x:
 *
 *   [margin][thread][marker][title ................................][note]
 *                           [where it came from]
 *
 * - The MARGIN (`RowLead`) says when, in one short word, right-aligned, so a list's dates end at
 *   one x and read down like a diary's left margin.
 * - The THREAD (`ProjectRail`) is the project's colour, a 3px strand at one x.
 * - The BODY carries everything else, and only the body is indented, hovered and selected: the
 *   margin and the thread stay put, so a deep tree's dates still read as one column.
 * - The second line says where a row came from -- the breadcrumb, what it waits on, how far along
 *   its children are -- and nothing about when; the note on the right says how late.
 */

/**
 * The body's own gutter after the thread: 8px on a phone, where a deep row's title needs every
 * pixel, and 14px from 640 up. Depth is added to this and to nothing before it: the thread carries
 * project identity only, and depth is carried by the hairline guides.
 *
 * A CSS VARIABLE set on the body, so the row, its guides and the new-task input all offset from
 * the one value at either width (`gutterPlus`).
 */
export const BODY_GUTTER = '[--gutter:8px] sm:[--gutter:14px]'

/** Every row list is a column of rows. No `@container`: nothing asks a list for its width. */
export const ROW_LIST = 'flex flex-col'

/**
 * THE THREAD: the 3px strand after the margin. It means ONE thing -- which project this belongs
 * to -- in every view: on a cross-project list that makes "which project is this" pre-attentive,
 * and down a run of one project's rows it is ONE strand -- the full height of every row and square,
 * so rows meet with no gap and no lozenge ends. (A segmented rail was logged as a defect once and
 * fixed; `project.spec` guards it.)
 *
 * `aria-hidden`, and never the only carrier: there are six hues and more projects than that, so
 * two projects can share one. The project's NAME is always on the row or the page as well
 * (WCAG 1.4.1).
 */
export function ProjectRail({ projectId }: { projectId: string | null }) {
  const rail = useProjectRail()
  return (
    <span
      aria-hidden="true"
      data-thread
      data-project-rail={projectId ?? undefined}
      // A thing in no project still has its strand, in the hairline's colour, so every row of a
      // list has the same parts at the same x.
      className={`pointer-events-none w-[3px] shrink-0 self-stretch ${
        projectId ? rail(projectId) : 'bg-rule'
      }`}
    />
  )
}
