import { useEffect, type ReactNode } from 'react'

/** How long a line of what was done stays, read and gone. */
const SHOWN_MS = 4000

/** A line of what was done, at the foot of the window. Said once by a screen reader as it comes. */
export function Toast({ children, onGone }: { children: ReactNode; onGone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onGone, SHOWN_MS)
    return () => clearTimeout(timer)
  }, [onGone])
  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-container bg-float px-3.5 py-2.5 text-ui text-ink shadow-float"
    >
      <span className="truncate">{children}</span>
    </div>
  )
}
