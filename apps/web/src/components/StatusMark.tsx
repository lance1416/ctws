import type { TaskStatus } from '@ctws/contracts'

// Status is told apart by shape, not colour (WCAG 1.4.1): a hollow ring has not started, a solid
// disc is being worked on, a disc with a check is done. Backlog is a dashed ring, cancelled a
// struck ring. Only fg / fg-muted are used, so no status needs a hue of its own.
//
// The mark is the app's core semantic and it used to be the faintest thing on the row: 16px of
// 1.5px muted stroke. It is now 18px of 1.75px, and a LIVE task (待办 / 进行中) draws it in full
// `fg` while a settled one (已完成 / 已取消) stays muted. That is weight by stroke,
// size and value -- still no hue, so the rule that status is carried by shape is intact.
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
  // Every task that is still open draws at full strength; only a settled one recedes. An open
  // task is the thing the list exists to show, and 待整理 is open -- it is untriaged, not done.
  const live = status !== 'done' && status !== 'cancelled'
  return (
    <svg
      role="img"
      aria-label={LABEL[status]}
      viewBox="0 0 18 18"
      width="18"
      height="18"
      fill="none"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${live ? 'text-fg' : 'text-fg-muted'}`}
    >
      <title>{LABEL[status]}</title>
      <circle
        cx="9"
        cy="9"
        r="7"
        stroke="currentColor"
        strokeDasharray={status === 'backlog' ? '2.4 2.4' : undefined}
      />
      <circle
        cx="9"
        cy="9"
        r="7"
        fill="currentColor"
        stroke="none"
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        className={`transition-transform duration-120 ${solid ? 'scale-100' : 'scale-0'}`}
      />
      <path
        d="M5.9 9.2l2.1 2.1 4.1-4.3"
        className={`stroke-surface transition-opacity duration-120 ${status === 'done' ? 'opacity-100' : 'opacity-0'}`}
      />
      {status === 'cancelled' && <path d="M5.6 9h6.8" stroke="currentColor" />}
    </svg>
  )
}
