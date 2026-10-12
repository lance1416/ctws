import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { tabbable } from 'tabbable'
import { useReservePane, useWidePane } from './paneLayout'

/**
 * THE DETAIL PANE, and it belongs to the SHELL.
 *
 * ONE SURFACE for looking at one thing, whatever module the thing came from. A pane for a task,
 * a row menu for a reading item and a dialog for a person would be three editing models in one
 * app, which means learning it three times.
 *
 * What this component owns is the FRAME -- where it sits, how wide, the escape, the focus trap,
 * the scrim below 1280 -- and nothing about what is in it. A module renders its own body inside.
 *
 * At >=1280 it is a third COLUMN that coexists with the list it was opened from: no scrim, no
 * trap, the list stays usable beside it. Below that there is no room for both, so it becomes a
 * layer and takes the keyboard with it. That is also why it is not built on Radix's Dialog, whose
 * `aria-hidden` on the rest of the page fights a component that has to coexist.
 */
export function DetailPane({
  label,
  onClose,
  children,
}: {
  /** The pane's accessible name: what KIND of thing is open -- “Task”, “People”. */
  label: string
  onClose: () => void
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const wide = useWidePane()
  useReservePane()

  // The panel is last in the DOM, so without this a keyboard user would tab past every row to
  // reach it. Escape also only works while focus is inside.
  useEffect(() => panel.current?.focus(), [])

  // It hangs below the top bar, whose height is a layout fact rather than a number to copy.
  const [top, setTop] = useState(0)
  useLayoutEffect(() => {
    const measure = () =>
      setTop(document.querySelector('header')?.getBoundingClientRect().bottom ?? 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      /**
       * ESCAPE UNWINDS ONE LEVEL, and the innermost level goes first.
       *
       * A module's body may have its own things to back out of before the pane itself -- a menu,
       * an inline edit, a discard prompt. It handles Escape on the way up and calls
       * `preventDefault`; this reads that as "already dealt with" and leaves the pane open. A
       * body that does nothing leaves the press to here, which closes.
       */
      if (e.defaultPrevented) return
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Tab' || wide) return
    /**
     * THE TRAP, and only in overlay mode. A layer that claims the keyboard and then lets Tab walk
     * out onto a page covered by a scrim is a WCAG 2.1.2 failure. `tabbable` decides both the
     * ORDER and the MEMBERSHIP of the cycle, not a hand-written selector that would miss whatever
     * a module puts in here next.
     */
    const items = panel.current ? tabbable(panel.current) : []
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) return e.preventDefault()
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panel.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      {/* Click-outside, and the wash that says the page behind is not the thing in hand. Only in
          overlay mode: as a coexisting pane, a click on the list is a click on the list. */}
      {!wide && (
        <div
          aria-hidden="true"
          data-detail-backdrop
          onClick={onClose}
          style={{ top }}
          // Below 1024 the tab bar is the screen's floor, so the scrim and the layer stop at it.
          className="fixed inset-x-0 bottom-0 z-20 bg-scrim max-lg:bottom-16"
        />
      )}
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-label={label}
        data-detail-mode={wide ? 'pane' : 'overlay'}
        onKeyDown={onKeyDown}
        // In the column the panel is inset by the grid's own gutter, so the 16px is added to the
        // top as well -- a panel flush with the top bar but with air on three sides would read as
        // a sheet that had slid down out of it.
        style={{ top: wide ? top + 16 : top }}
        // A COLUMN, so the one irreversible action (`DangerZone`, `mt-auto`) can be pushed to the
        // pane's floor when what is above it is short, instead of hanging under the last field.
        className={`fixed z-20 flex flex-col overflow-y-auto p-5 text-fg focus:outline-none ${
          // A COLUMN is a PANEL in the page's right-hand column: the same surface, radius and
          // hairline every other panel wears, so it reads as part of the page rather than a form
          // bolted to the window's edge. Its 22rem plus the two 16px gutters is the 24rem track
          // Layout takes out of the grid.
          // A LAYER is above the page: flush with the edges, raised surface, scrim beneath.
          wide
            ? 'right-4 bottom-4 w-[22rem] rounded-xl border border-border-subtle bg-surface-panel shadow-panel'
            : 'right-0 bottom-0 w-full max-w-md border-l border-border-subtle bg-surface-raised max-lg:bottom-16'
        }`}
      >
        {children}
      </div>
    </>
  )
}

/**
 * The pane's header: what kind of thing this is, and the way out.
 *
 * Every module's body starts with one, so the close control is in the same place whatever is
 * open. `trailing` is for the one or two controls that belong to the whole thing (Delete, Edit).
 */
export function DetailHead({
  kind,
  onClose,
  trailing,
}: {
  kind: ReactNode
  onClose: () => void
  trailing?: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5">{kind}</div>
      <div className="-mt-1 flex shrink-0 items-center gap-1">
        {trailing}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4">
            <path
              d="M4 4l8 8M12 4l-8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
