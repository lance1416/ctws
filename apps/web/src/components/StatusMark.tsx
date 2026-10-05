import type { TaskStatus } from '@ctws/contracts'

// Status is told apart by shape, not colour (WCAG 1.4.1): a hollow ring has not started, a solid
// disc is being worked on, a disc with a check is done. Backlog is a dashed ring, cancelled a
// struck ring. Only fg / fg-muted are used, so no status needs a hue of its own.
//
// The mark is the app's core semantic and it used to be the faintest thing on the row. It is now
// 20px of 2px stroke, and a LIVE task (待办 / 进行中) draws it in full `fg` while a settled one
// (已完成 / 已取消) stays muted. That is weight by stroke, size and value -- still no hue, so the
// rule that status is carried by shape is intact.
//
// The 2px stroke is the workbench spec's (section 4). The SIZE is 20 and not the 17 that section
// names, because that 17 was derived from a "原 16" that has not been true since the previous
// stage shipped 18/1.75: taking the spec's number literally would SHRINK the app's core semantic
// on the very page that exists to answer "组件太小", and would leave a 20px glyph-well sitting in
// a 46px row. 20 is 18 stepped up by the same one step the rest of section 4 asks for.
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
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${live ? 'text-fg' : 'text-fg-muted'}`}
    >
      <title>{LABEL[status]}</title>
      <circle
        cx="10"
        cy="10"
        r="7.8"
        stroke="currentColor"
        strokeDasharray={status === 'backlog' ? '2.7 2.7' : undefined}
      />
      <circle
        cx="10"
        cy="10"
        r="7.8"
        fill="currentColor"
        stroke="none"
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        className={`transition-transform duration-120 ${solid ? 'scale-100' : 'scale-0'}`}
      />
      <path
        d="M6.6 10.2l2.3 2.3 4.5-4.8"
        className={`stroke-surface-panel transition-opacity duration-120 ${status === 'done' ? 'opacity-100' : 'opacity-0'}`}
      />
      {status === 'cancelled' && <path d="M6.2 10h7.6" stroke="currentColor" />}
    </svg>
  )
}
