import type { TaskStatus } from '@ctws/contracts'
import { toggleDoneTarget, toggleStartTarget } from '../api/taskActions'
import { StatusMark } from './StatusMark'

/**
 * The status mark as a control: one click finishes the task (or restores a finished one). The
 * shape of the mark still says what state it is in; the aria-label says what the click will do.
 * Out of the tab order on purpose: the keyboard route is `x` on the focused row, so a list of N
 * rows does not grow N more tab stops.
 */
export function StatusButton({
  status,
  title,
  onClick,
  className = '',
}: {
  status: TaskStatus
  title: string
  onClick: () => void
  className?: string
}) {
  const inactive = status === 'done' || status === 'cancelled'
  return (
    <button
      type="button"
      tabIndex={-1}
      data-status-button
      aria-label={inactive ? `恢复「${title}」` : `完成「${title}」`}
      onClick={onClick}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-surface-hover ${className}`}
    >
      <StatusMark status={status} />
    </button>
  )
}

/** Start / stop: the cheap route to 正在做. Same out-of-tab-order rule; the key is `s`. */
export function StartButton({
  status,
  title,
  onClick,
  className = '',
}: {
  status: TaskStatus
  title: string
  onClick: () => void
  className?: string
}) {
  const running = status === 'in_progress'
  return (
    <button
      type="button"
      tabIndex={-1}
      data-start-button
      aria-label={running ? `暂停「${title}」` : `开始「${title}」`}
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover hover:text-fg ${className}`}
    >
      <svg
        viewBox="0 0 16 16"
        width="17"
        height="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={running ? 'M5.5 4v8M10.5 4v8' : 'M5.5 3.5l7 4.5-7 4.5z'} />
      </svg>
    </button>
  )
}

/** The key route shared by the tree and the Today page: `x` finishes / restores, `s` starts / stops. */
export function statusForKey(
  e: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  status: TaskStatus,
): TaskStatus | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null
  if (e.key === 'x') return toggleDoneTarget(status)
  if (e.key === 's') return toggleStartTarget(status)
  return null
}
