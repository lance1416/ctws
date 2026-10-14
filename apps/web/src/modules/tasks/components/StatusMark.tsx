import type { TaskStatus } from '@ctws/contracts'

// Status is told apart by shape, not colour (WCAG 1.4.1): a hollow ring has not started, a ring
// filled on its right half is being worked on -- half way, which is what "in progress" says -- and
// a disc with a check is done. Backlog is a dashed ring, cancelled a struck ring. Only ink and
// ink-muted are used, so no status needs a hue of its own.
//
// The mark is the app's core semantic, so it carries weight: 20px of 2px stroke, with a LIVE task
// (To do / In progress) drawn in full `ink` while a settled one (Done / Cancelled) stays muted.
// That is weight by stroke, size and value -- still no hue, so the rule that status is carried by
// shape is intact.
//
// The stroke is 2px and the SIZE is 20. 20 and not 17: 17 is what a 16px mark steps up to, and
// this one is 18, so the same one step up gives 20. 17 would shrink the core semantic and leave a
// 20px glyph-well sitting in a 46px row.
// The half, the disc and the check are always rendered and fade or scale in, so the 120ms echo of
// a status change is a transition on a persistent element rather than a mount.
const LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
}

export function StatusMark({ status }: { status: TaskStatus }) {
  const half = status === 'in_progress'
  const solid = status === 'done'
  // Every task that is still open draws at full strength; only a settled one recedes. An open
  // task is the thing the list exists to show, and backlog is open -- untriaged, not done.
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
      className={`shrink-0 ${live ? 'text-ink' : 'text-ink-muted'}`}
    >
      <title>{LABEL[status]}</title>
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
