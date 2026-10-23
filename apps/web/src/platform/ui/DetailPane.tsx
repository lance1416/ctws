import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { tabbable } from 'tabbable'
import { useWidePane } from './paneLayout'
import { CloseIcon } from './icons'
import { LAYER } from './layers'

/**
 * The shell's frame for one open item; the module renders the body. At >=1280 it is a column beside
 * the list; below that, an overlay with a scrim and a focus trap. Not Radix Dialog, whose
 * `aria-hidden` on the rest of the page would hide the list the column sits beside.
 */
export function DetailPane({
  label,
  onClose,
  children,
}: {
  /** The accessible name: what kind of thing is open, e.g. “Task”. */
  label: string
  onClose: () => void
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const wide = useWidePane()

  // The panel is last in the DOM, and Escape only works while focus is inside.
  useEffect(() => panel.current?.focus(), [])

  // Hang below the header, measured rather than hard-coded.
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
      // A body that backs out of something of its own (a menu, an inline edit) calls
      // `preventDefault`, and the pane stays open.
      if (e.defaultPrevented) return
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Tab' || wide) return
    // Overlay mode traps Tab; `tabbable` decides the cycle's order and members.
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
      {!wide && (
        <div
          aria-hidden="true"
          data-detail-backdrop
          onClick={onClose}
          style={{ top }}
          // Below 1024 the scrim stops at the tab bar.
          className={`fixed inset-x-0 bottom-0 ${LAYER.pane} bg-scrim max-lg:bottom-16`}
        />
      )}
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-label={label}
        data-detail-mode={wide ? 'pane' : 'overlay'}
        onKeyDown={onKeyDown}
        // As a column it is the page's right edge, top to bottom (artboard 8, I-08); as an
        // overlay, a sheet 12px in from the edges.
        style={{ top: wide ? top : top + 12 }}
        // A flex column so `DangerZone` (`mt-auto`) sits on the pane's floor.
        className={`fixed ${LAYER.pane} flex flex-col overflow-y-auto bg-float p-5 text-ink shadow-float focus:outline-none ${
          wide
            ? 'right-0 bottom-0 w-inspector'
            : // Below 1024 the overlay stops 12px above the tab bar.
              'right-3 bottom-3 w-[calc(100%-1.5rem)] max-w-md rounded-block max-lg:bottom-19'
        }`}
      >
        {children}
      </div>
    </>
  )
}

/** `trailing` holds controls for the whole item (Delete, Edit), before the close button. */
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
        <CloseButton onClick={onClose} />
      </div>
    </div>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      data-detail-close
      className="flex h-9 w-9 items-center justify-center rounded-control text-muted hover:bg-hover hover:text-ink"
    >
      <CloseIcon size={16} className="h-4 w-4" />
    </button>
  )
}
