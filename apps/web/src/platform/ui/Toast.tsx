import { useEffect, type ReactNode } from 'react'
import { ICON_BUTTON } from './buttonStyles'
import { CloseIcon } from './icons'

/** How long a line of what was done stays, read and gone. */
const SHOWN_MS = 4000

/**
 * A line of what was done, at the foot of the window. Said once by a screen reader as it comes.
 * With `lines` under it there is more to read than a few seconds allow, so it stays until closed.
 */
export function Toast({
  children,
  lines,
  onGone,
}: {
  children: ReactNode
  lines?: readonly string[]
  onGone: () => void
}) {
  const stays = lines !== undefined && lines.length > 0
  useEffect(() => {
    if (stays) return
    const timer = setTimeout(onGone, SHOWN_MS)
    return () => clearTimeout(timer)
  }, [onGone, stays])
  return (
    <div
      role="status"
      className={`fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 gap-3 rounded-container bg-float px-3.5 py-2.5 text-ui text-ink shadow-float ${
        stays ? 'w-md items-start' : 'items-center'
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
        <span className="truncate">{children}</span>
      )}
    </div>
  )
}
