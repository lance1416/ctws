import { useEffect, useState, type ReactNode } from 'react'
import { ICON_BUTTON } from './buttonStyles'
import { CloseIcon } from './icons'

/** How long a line of what was done stays, read and gone. */
const SHOWN_MS = 4000
/** Longer with something to press, and held while the pointer is on it. */
const ACTION_MS = 5000

/**
 * A line of what was done, at the foot of the window. Said once by a screen reader as it comes.
 * With `lines` under it there is more to read than a few seconds allow, so it stays until closed.
 */
export function Toast({
  children,
  lines,
  action,
  onGone,
}: {
  children: ReactNode
  lines?: readonly string[]
  /** One thing to do about it, at the end of the line: Undo, Retry. */
  action?: { label: string; onPress: () => void }
  onGone: () => void
}) {
  const stays = lines !== undefined && lines.length > 0
  const [held, setHeld] = useState(false)
  const ms = action ? ACTION_MS : SHOWN_MS
  useEffect(() => {
    if (stays || held) return
    const timer = setTimeout(onGone, ms)
    return () => clearTimeout(timer)
  }, [onGone, stays, held, ms])
  return (
    <div
      role="status"
      data-toast
      onPointerEnter={() => setHeld(action !== undefined)}
      onPointerLeave={() => setHeld(false)}
      // 44 for a line; from 1024 up it stands 12 clear of the status bar.
      className={`fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 gap-3 rounded-container bg-float px-3.5 text-ui text-ink shadow-float lg:bottom-9 ${
        stays ? 'w-md items-start py-2.5' : 'min-h-11 items-center py-1.5'
      }`}
    >
      {stays ? (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span>{children}</span>
            <ul className="flex flex-col gap-0.5 text-muted">
              {lines.map((line, i) => (
                <li key={`${i}:${line}`}>{line}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onGone}
            className={`${ICON_BUTTON} -my-1 -mr-1.5`}
          >
            <CloseIcon size={16} aria-hidden="true" />
          </button>
        </>
      ) : (
        <>
          <span className="truncate">{children}</span>
          {action && (
            <button
              type="button"
              onClick={action.onPress}
              className="-my-1 -mr-1.5 h-7 shrink-0 rounded-control px-2 font-medium text-task-t hover:bg-hover"
            >
              {action.label}
            </button>
          )}
        </>
      )}
    </div>
  )
}
