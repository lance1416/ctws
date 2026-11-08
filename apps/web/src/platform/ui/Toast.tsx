import { useEffect, useState, type ReactNode } from 'react'
import { ICON_BUTTON } from './buttonStyles'
import { CloseIcon } from './icons'

/** How long a line of what was done stays, read and gone. */
const SHOWN_MS = 4000
/** Longer with something to press, and held while the pointer is on it. */
const ACTION_MS = 5000

/** The gap a line keeps above whatever ends the window under it. */
const CLEAR_PX = 12

/**
 * On a phone, how far up the line stands when something rises over the tab bar: the keyboard, or
 * a bottom sheet. Null while neither is up, and on a computer: the stylesheet places it then.
 */
function useRaisedFoot(): number | null {
  const [bottom, setBottom] = useState<number | null>(null)
  useEffect(() => {
    const phone = window.matchMedia('(max-width: 1023.98px)')
    const measure = () => {
      if (!phone.matches) return setBottom(null)
      const vv = window.visualViewport
      const keyboard = vv ? window.innerHeight - (vv.height + vv.offsetTop) : 0
      const sheets = [...document.querySelectorAll<HTMLElement>('[data-bottom-sheet]')]
      const sheetTop = Math.min(...sheets.map((s) => s.getBoundingClientRect().top))
      const sheet = sheets.length > 0 ? window.innerHeight - sheetTop : 0
      const over = Math.max(keyboard, sheet)
      setBottom(over > 0 ? over + CLEAR_PX : null)
    }
    measure()
    // A sheet comes and goes, or is dragged taller, without a resize: the page's changes say so.
    const seen = new MutationObserver(measure)
    seen.observe(document.body, { childList: true, subtree: true, attributes: true })
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)
    phone.addEventListener('change', measure)
    return () => {
      seen.disconnect()
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
      phone.removeEventListener('change', measure)
    }
  }, [])
  return bottom
}

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
  const raised = useRaisedFoot()
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
      style={raised === null ? undefined : { bottom: raised }}
      // 44 for a line, 48 on a phone; 12 clear of what ends the window: the status bar, the tab bar
      // (its safe area under it not counted), or the keyboard or a sheet over it.
      className={`pointer-events-auto fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 gap-3 rounded-container bg-float px-3.5 text-ui text-ink shadow-float lg:bottom-9 ${
        stays ? 'w-md items-start py-2.5' : 'min-h-11 items-center py-1.5 max-lg:min-h-12'
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
              className="-my-1 -mr-1.5 h-7 shrink-0 rounded-control px-2 font-medium text-task-t hover:bg-hover max-lg:h-11 max-lg:min-w-11"
            >
              {action.label}
            </button>
          )}
        </>
      )}
    </div>
  )
}
