import { isFinished } from '../status'
import type { TaskStatus } from '@ctws/contracts'
import { toggleDoneTarget, toggleStartTarget } from '../api/taskActions'
import { StatusMark } from './StatusMark'

/**
 * The status mark as a control: one click finishes the task, or restores a finished one. Out of
 * the tab order: `x` on the focused row is the keyboard route, so rows add no tab stops.
 */
export function StatusButton({
  status,
  title,
  onClick,
}: {
  status: TaskStatus
  title: string
  onClick: () => void
}) {
  const inactive = isFinished(status)
  return (
    <button
      type="button"
      tabIndex={-1}
      data-status-button
      aria-label={inactive ? `Reopen “${title}”` : `Complete “${title}”`}
      onClick={onClick}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-hover`}
    >
      <StatusMark status={status} />
    </button>
  )
}

/** Start / stop: the cheap route to In progress. Same out-of-tab-order rule; the key is `s`. */
export function StartButton({
  status,
  title,
  onClick,
}: {
  status: TaskStatus
  title: string
  onClick: () => void
}) {
  const running = status === 'in_progress'
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={running ? `Pause “${title}”` : `Start “${title}”`}
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-hover hover:text-ink`}
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

/** The keys for the tree and Today: `x` finishes or restores, `s` starts or stops. */
export function statusForKey(
  e: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  status: TaskStatus,
): TaskStatus | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null
  if (e.key === 'x') return toggleDoneTarget(status)
  if (e.key === 's') return toggleStartTarget(status)
  return null
}
