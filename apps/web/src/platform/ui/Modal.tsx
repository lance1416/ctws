import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { enterOverlay, exitOverlay } from '../keyboard/overlayState'
import { BUTTON } from './buttonStyles'
import { LAYER } from './layers'
import { UnsavedAsk } from './UnsavedAsk'
import type { UnsavedGuard } from './unsavedGuard'

/**
 * The control last pressed with a pointer. Safari on macOS does not focus a button that is
 * clicked, so a layer opened by a click would find <body> focused and have nothing to give focus
 * back to (BUG-026); the press itself says where it came from.
 */
let pressed: { el: Element; at: number } | null = null
if (typeof document !== 'undefined')
  document.addEventListener(
    'pointerdown',
    (e) => {
      const el =
        e.target instanceof Element ? e.target.closest('button, a[href], [role="button"]') : null
      pressed = el ? { el, at: performance.now() } : null
    },
    true,
  )

/** What opened a layer: the focused control, or the one just pressed when focus stayed on <body>. */
function openerNow(): Element | null {
  const active = document.activeElement
  if (active && active !== document.body) return active
  return pressed && performance.now() - pressed.at < 1000 ? pressed.el : active
}

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A modal layer on Radix's Dialog: focus trap, Escape and press-outside are Radix's, the look is
 * ours. The detail pane is not one of these: it has to coexist with the list it opened from.
 */
export function Modal({
  title,
  onClose,
  initialFocus,
  dismissLabel = 'Close',
  unsaved = false,
  palette = false,
  wide = false,
  narrow = false,
  picker = false,
  children,
}: {
  title: string
  onClose: () => void
  /** What takes focus when the layer opens, instead of the first tabbable thing. */
  initialFocus?: RefObject<HTMLElement | null>
  /** The header's own dismiss control. `null` on a layer whose footer already carries Cancel. */
  dismissLabel?: string | null
  /**
   * Something typed in would be lost, so Escape, the scrim and the header's dismiss ask first.
   * The footer's Cancel still discards: pressing it is the decision.
   */
  unsaved?: boolean
  /** A palette (search, the key list): no title row, and wide enough for columns. */
  palette?: boolean
  /** Three columns of content (the key list). */
  wide?: boolean
  /** One question and two buttons (a delete's). */
  narrow?: boolean
  /** A palette at a picker's 380 (Link, artboard 9): no title row, one column of rows. */
  picker?: boolean
  children: ReactNode
}) {
  // These layers have no trigger element (`?` and `n` are keys), so the opener is captured during
  // render, before Radix moves focus into the panel, and focus goes back to it on close.
  const opener = useRef<Element | null>(null)
  if (opener.current === null) opener.current = openerNow()

  // The document-level single keys (`/`, `f`, `?`, the `g` chords) stand down under a layer.
  useEffect(() => {
    enterOverlay()
    return exitOverlay
  }, [])

  const guard = useCloseGuard(unsaved, onClose)

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) guard.leave(onClose)
      }}
    >
      <Dialog.Portal>
        {/* The scrim is the scroll container, so a tall panel scrolls the layer, not the page. */}
        <Dialog.Overlay
          // Closed on the press, and only one that starts on the scrim: Radix's own outside click
          // is armed a macrotask after mount and can miss a press made as the layer opens.
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) guard.leave(onClose)
          }}
          // `max-sm:pt-24`: the top bar stays above the scrim and is two rows tall on a phone.
          className={`fixed inset-0 ${LAYER.pane} flex justify-center overflow-y-auto bg-scrim px-4 ${wide ? 'pt-[calc(8vh-1.25rem)] pb-[8vh]' : 'py-[8vh]'} max-sm:pt-24`}
        >
          <Dialog.Content
            aria-describedby={undefined}
            // Firefox does not bring a focused control in a tall layer into view (BUG-027).
            onFocus={(e) => {
              if (e.target instanceof HTMLElement) e.target.scrollIntoView({ block: 'nearest' })
            }}
            // Radix keeps plain Tab inside the layer; Safari's Option+Tab walks every control, and
            // it must wrap at the ends too (BUG-026).
            onKeyDown={(e) => {
              if (e.key !== 'Tab' || !e.altKey || e.ctrlKey || e.metaKey) return
              const all = [...e.currentTarget.querySelectorAll<HTMLElement>(TABBABLE)].filter(
                (el) => el.offsetParent !== null,
              )
              const first = all[0]
              const last = all.at(-1)
              if (!first || !last) return
              if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault()
                first.focus()
              } else if (e.shiftKey && document.activeElement === first) {
                e.preventDefault()
                last.focus()
              }
            }}
            // Escape on the question is "Keep editing", as it is on a pane's.
            onEscapeKeyDown={(e) => {
              if (!guard.asking) return
              e.preventDefault()
              guard.keep()
            }}
            // A menu opened inside the layer is portalled to <body>; pressing in it is not outside.
            onInteractOutside={(e) => {
              const target = e.target
              if (
                target instanceof Element &&
                target.closest('[data-radix-popper-content-wrapper]')
              ) {
                e.preventDefault()
              }
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              // Someone else may own the keyboard by now (closing help and pressing `f` opens
              // search); only a focus that fell to <body> is ours to put back.
              if (document.activeElement && document.activeElement !== document.body) return
              const el = opener.current
              if (el instanceof HTMLElement && el.isConnected) el.focus()
            }}
            onOpenAutoFocus={
              initialFocus &&
              ((e) => {
                e.preventDefault()
                initialFocus.current?.focus()
              })
            }
            className={`h-fit w-full rounded-block bg-float shadow-float ${wide ? 'max-w-[70rem]' : narrow ? 'max-w-lg' : picker ? 'max-w-[23.75rem]' : palette ? 'max-w-[58rem]' : 'max-w-reading'}`}
          >
            {palette || picker ? (
              <Dialog.Title className="sr-only">{title}</Dialog.Title>
            ) : (
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <Dialog.Title className="font-medium text-ink">{title}</Dialog.Title>
                {dismissLabel !== null && (
                  <Dialog.Close className={BUTTON.inline}>{dismissLabel}</Dialog.Close>
                )}
              </div>
            )}
            {guard.asking && (
              <div className="px-5 pt-4">
                <UnsavedAsk guard={guard} />
              </div>
            )}
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * The leave guard's close half, for a layer that is not a route: `useUnsavedGuard` also holds the
 * router, and the router takes one blocker at a time, which the pane underneath may already hold.
 */
function useCloseGuard(unsaved: boolean, onClose: () => void): UnsavedGuard {
  const [asking, setAsking] = useState(false)
  const focusOn = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (asking) focusOn.current?.focus()
  }, [asking])
  return {
    asking,
    leaving: false,
    focusOn,
    leave: (go) => (unsaved ? setAsking(true) : go()),
    keep: () => setAsking(false),
    discard: () => {
      setAsking(false)
      onClose()
    },
  }
}
