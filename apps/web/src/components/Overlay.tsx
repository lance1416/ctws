import { useEffect, useRef, type ReactNode } from 'react'
import { enterOverlay, exitOverlay } from './overlayState'

/**
 * The shared in-page overlay: search and the shortcut list. Never `window.confirm` or any other
 * browser dialog -- a browser modal blocks this project's automation (the DeleteConfirm rule,
 * applied to something that genuinely has to float).
 *
 * Closes on Escape and on a press outside the panel. `mousedown` rather than `click`: a drag that
 * starts on the panel and ends on the backdrop is not someone asking to close.
 *
 * Focus returns to whatever opened the overlay, but only if focus is still inside the panel when
 * it goes: choosing a search result sends focus to a task row, and yanking it back to the header
 * would undo the one thing the result was for.
 */
export function Overlay({
  label,
  onClose,
  className = '',
  children,
}: {
  label: string
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)
  const mounts = useRef(0)
  // Captured during RENDER, not in the effect: `autoFocus` is applied in the commit phase, so by
  // the time an effect runs the activeElement is already the overlay's own input and the control
  // that opened it is lost.
  if (opener.current === null) opener.current = document.activeElement

  useEffect(() => {
    mounts.current += 1
    const mine = mounts.current
    enterOverlay()
    return () => {
      exitOverlay()
      const el = opener.current
      queueMicrotask(() => {
        // StrictMode remounts every effect once in development; that is not a close.
        if (mounts.current !== mine) return
        // Someone else already claimed focus -- choosing a search result sends it to a task row,
        // and yanking it back to the header would undo the one thing the result was for. Only a
        // focus that fell to <body> (WCAG 2.4.3) is ours to repair.
        if (document.activeElement && document.activeElement !== document.body) return
        if (el instanceof HTMLElement && el.isConnected) el.focus()
      })
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  return (
    // `max-sm:pt-24`: the sticky top bar is two rows tall below 640px and sits above the scrim
    // (z-30), which sliced the top off this panel on a phone. Same correction as `Modal`'s, so the
    // migrated layer and this one still sit in the same place.
    <div className="fixed inset-0 z-20 flex justify-center overflow-y-auto bg-scrim px-4 py-[8vh] max-sm:pt-24">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`h-fit w-full max-w-[68ch] border border-border-strong bg-surface-raised ${className}`}
      >
        {children}
      </div>
    </div>
  )
}
