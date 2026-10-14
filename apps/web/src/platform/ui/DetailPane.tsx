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
        // 12px under the header as well as in from the window's edges, in both modes: a sheet flush
        // with the header but with air on three sides would read as having slid down out of it.
        style={{ top: top + 12 }}
        // A COLUMN, so the one irreversible action (`DangerZone`, `mt-auto`) can be pushed to the
        // pane's floor when what is above it is short, instead of hanging under the last field.
        className={`fixed z-20 flex flex-col overflow-y-auto p-5 text-ink focus:outline-none ${
          // THE SHEET, the same object in both modes: a `float`, 10px round, lifted, 12px in from
          // every edge it is near. As a COLUMN it sits in the right-hand track Layout takes out of
          // the grid (22rem inside 24rem); as a LAYER it is over the page with the scrim beneath,
          // and below 1024 it stops 12px above the tab bar rather than under it.
          `right-3 bottom-3 rounded-[10px] bg-float shadow-float ${
            wide ? 'w-[22rem]' : 'w-[calc(100%-1.5rem)] max-w-md max-lg:bottom-19'
          }`
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
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-hover hover:text-ink"
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
