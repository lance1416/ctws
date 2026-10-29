import type { TaskStatus } from '@ctws/contracts'

/** A task's status in words: the mark's name, a picker's choices. */
export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
}

/**
 * A task's status by shape, never by hue alone. Every part is always drawn and fades or scales in,
 * so a change is a transition, not a remount.
 */
export function StatusMark({ status, size = 20 }: { status: TaskStatus; size?: 14 | 16 | 20 }) {
  const half = status === 'in_progress'
  // Artboard 1: what is being worked on is green, what waits to be started muted, and the backlog
  // and what is settled subtle; the shape says which it is as well.
  const tone = half ? 'text-go' : status === 'todo' ? 'text-muted' : 'text-subtle'
  return (
    <svg
      role="img"
      aria-label={STATUS_LABEL[status]}
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${tone}`}
    >
      <title>{STATUS_LABEL[status]}</title>
      <circle
        cx="10"
        cy="10"
        r="7.8"
        stroke="currentColor"
        strokeDasharray={status === 'backlog' ? '2.7 2.7' : undefined}
      />
      <path
        data-part="half"
        d="M10 2.2a7.8 7.8 0 0 1 0 15.6z"
        fill="currentColor"
        stroke="none"
        className={`transition-opacity duration-120 ${half ? 'opacity-100' : 'opacity-0'}`}
      />
      {/* Done is the ring and a check, in the settled tone: lighter than what is still to do
          (artboards 1, 3 and 21, U-24). */}
      <path
        data-part="check"
        d="M6.6 10.2l2.3 2.3 4.5-4.8"
        stroke="currentColor"
        className={`transition-opacity duration-120 ${status === 'done' ? 'opacity-100' : 'opacity-0'}`}
      />
      {status === 'cancelled' && <path d="M6.2 10h7.6" stroke="currentColor" />}
    </svg>
  )
}
