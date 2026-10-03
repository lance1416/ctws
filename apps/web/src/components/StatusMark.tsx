import type { TaskStatus } from '@ctws/contracts'

// Status is told apart by shape, not colour (WCAG 1.4.1): a hollow ring has not started, a solid
// disc is being worked on, a disc with a check is done. Backlog is a dashed ring, cancelled a
// struck ring. Only fg / fg-muted are used, so no status needs a hue of its own.
// The disc and the check are always rendered and scale/fade in, so the 120ms echo of a status
// change is a transition on a persistent element rather than a mount.
const LABEL: Record<TaskStatus, string> = {
  backlog: '待整理',
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  cancelled: '已取消',
}

export function StatusMark({ status }: { status: TaskStatus }) {
  const solid = status === 'in_progress' || status === 'done'
  return (
    <svg
      role="img"
      aria-label={LABEL[status]}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${status === 'in_progress' ? 'text-fg' : 'text-fg-muted'}`}
    >
      <title>{LABEL[status]}</title>
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        strokeDasharray={status === 'backlog' ? '2.2 2.2' : undefined}
      />
      <circle
        cx="8"
        cy="8"
        r="6.25"
        fill="currentColor"
        stroke="none"
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        className={`transition-transform duration-120 ${solid ? 'scale-100' : 'scale-0'}`}
      />
      <path
        d="M5.2 8.2l1.9 1.9 3.7-3.9"
        className={`stroke-surface transition-opacity duration-120 ${status === 'done' ? 'opacity-100' : 'opacity-0'}`}
      />
      {status === 'cancelled' && <path d="M5 8h6" stroke="currentColor" />}
    </svg>
  )
}
