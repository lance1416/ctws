import type { TaskStatus } from '@ctws/contracts'
import { isFinished, STATUS_LABEL } from '../status'

/**
 * A task's status, by SHAPE, never by hue (WCAG 1.4.1): a hollow ring not started, half filled in
 * progress, a disc with a check done, dashed for backlog, struck for cancelled. 20px at a 2px
 * stroke; a live task in full ink, a settled one muted. The parts are always drawn and fade or
 * scale in, so a change is a transition, not a remount.
 */
export function StatusMark({ status }: { status: TaskStatus }) {
  const half = status === 'in_progress'
  const solid = status === 'done'
  // Every task that is still open draws at full strength; only a settled one recedes. An open
  // task is the thing the list exists to show, and backlog is open -- untriaged, not done.
  const live = !isFinished(status)
  return (
    <svg
      role="img"
      aria-label={STATUS_LABEL[status]}
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${live ? 'text-ink' : 'text-ink-muted'}`}
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
      <circle
        data-part="disc"
        cx="10"
        cy="10"
        r="7.8"
        fill="currentColor"
        stroke="none"
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        className={`transition-transform duration-120 ${solid ? 'scale-100' : 'scale-0'}`}
      />
      <path
        data-part="check"
        d="M6.6 10.2l2.3 2.3 4.5-4.8"
        className={`stroke-on-ink transition-opacity duration-120 ${status === 'done' ? 'opacity-100' : 'opacity-0'}`}
      />
      {status === 'cancelled' && <path d="M6.2 10h7.6" stroke="currentColor" />}
    </svg>
  )
}
