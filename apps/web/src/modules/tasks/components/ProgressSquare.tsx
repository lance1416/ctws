import type { ChildCounts, TaskStatus } from '@ctws/contracts'
import { STATUS_LABEL } from '../../../platform/ui/StatusMark'

/** What the square shows: a quarter step of what is done, or how it all ended (artboard 32). */
type Fill = 0 | 25 | 50 | 75 | 'check' | 'x' | 'dash'

export function fillOf({ done, counted, backlog }: ChildCounts): Fill {
  if (counted === 0) return backlog > 0 ? 'dash' : 'x'
  if (done === counted) return 'check'
  const share = done / counted
  return share === 0 ? 0 : share < 0.5 ? 25 : share < 0.75 ? 50 : 75
}

/** How high the fill stands in each step, on the icon's 24 grid. */
const FILLED = { 25: { y: 14, height: 3 }, 50: { y: 11.5, height: 5.5 }, 75: { y: 9, height: 8 } }

/** The status the children give the parent decides its colour: green while one is under way. */
const TONE: Partial<Record<TaskStatus, string>> = { in_progress: 'text-go', todo: 'text-muted' }

/**
 * A parent's progress where a leaf has its status (FR-043, artboard 32): a rounded square filled
 * from the bottom by the share of its leaves that is done (of those neither in the backlog nor
 * cancelled), in quarter steps; a check when all are done, a cross when all were cancelled, a
 * dashed edge while the rest wait in the backlog. The same size as the status mark beside it: 16
 * in a row, 20 in a title.
 */
export function ProgressSquare({
  status,
  children,
  size = 16,
}: {
  status: TaskStatus
  children: ChildCounts
  size?: 16 | 20
}) {
  const fill = fillOf(children)
  const done = `${children.done} of ${children.counted} done`
  return (
    <svg
      role="img"
      aria-label={`${STATUS_LABEL[status]}, ${done}`}
      data-progress-square={fill}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${TONE[status] ?? 'text-subtle'}`}
    >
      <title>{done}</title>
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="4"
        strokeDasharray={fill === 'dash' ? '3 3' : undefined}
      />
      {typeof fill === 'number' && fill !== 0 && (
        <rect x="7" width="10" rx="1" fill="currentColor" stroke="none" {...FILLED[fill]} />
      )}
      {fill === 'check' && <path d="m8.5 12 2.5 2.5 4.5-5" />}
      {fill === 'x' && <path d="m15 9-6 6M9 9l6 6" />}
    </svg>
  )
}
