import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { enterOverlay, exitOverlay } from './overlayState'

/**
 * THE MODAL LAYER, on Radix (`@radix-ui/react-dialog`).
 *
 * WHY A LIBRARY. The rule this project keeps is against STYLED KITS (MUI / Chakra / Ant), which
 * dilute a design into their defaults -- not against every dependency. Hand-building this means
 * hand-building a focus trap, focus restoration, Escape and press-outside for every dialog, and
 * getting WCAG 2.1.2 right in each. Radix ships zero styles, so every visual decision below is
 * still this project's: the scrim, the measure, the border and the type (and the palette grep
 * applies to this file like any other).
 *
 * EVERY FLOATING LAYER IS HERE: an `aria-modal="true"` with no Tab handling behind it promises
 * assistive technology that the rest of the page is unreachable while the keyboard walks straight
 * into it.
 *
 * What is NOT here, and is a decision rather than a leftover: `DeleteConfirm` (an inline
 * `alertdialog` block inside a panel, never a layer of its own) and the DETAIL PANE. The pane may
 * never move: it is a third COLUMN at >=1280 and a layer below that, and `Dialog`'s semantics
 * (scrim, trap, and above all `aria-hidden` on the rest of the page) fight a component that must
 * be able to coexist with the list it was opened from. Its trap is built on `tabbable` instead,
 * in `TaskDetail`, and exists only in the overlay half.
 */
export function Modal({
  title,
  onClose,
  className = '',
  /**
   * What takes focus when the layer opens. Radix otherwise focuses the first tabbable thing in
   * the panel, which is whatever the header happens to put first; the New task dialog opens on
   * its title field because that is the thing being typed.
   */
  initialFocus,
  /** The header's own dismiss control. `null` on a layer whose footer already carries Cancel. */
  dismissLabel = 'Close',
  children,
}: {
  title: string
  onClose: () => void
  className?: string
  initialFocus?: RefObject<HTMLElement | null>
  dismissLabel?: string | null
  children: ReactNode
}) {
  /**
   * WHERE FOCUS GOES BACK TO. Radix restores it to the `Dialog.Trigger`, and these layers have no
   * trigger element -- `?` and `n` are keys, and the same layer is also opened by a toolbar button
   * -- so with nothing to go back to a modal `Dialog.Content` leaves focus on `<body>` (WCAG
   * 2.4.3). The opener is captured here instead, during RENDER rather than in an effect: by the
   * time an effect runs, Radix has already moved focus into the panel and the control that opened
   * it is lost. This is the same capture the hand-built `Overlay` did, for the same reason.
   */
  const opener = useRef<Element | null>(null)
  if (opener.current === null) opener.current = document.activeElement

  // Radix owns the keyboard INSIDE the layer; it knows nothing about this app's document-level
  // single-key handlers (`/`, `f`, `?`, the `g` chords), which would otherwise keep firing
  // underneath -- `f` on the shortcut list would stack a search dialog over it. The counter that
  // stood them down for the hand-built overlay still does the same job here.
  useEffect(() => {
    enterOverlay()
    return exitOverlay
  }, [])

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        // The owner stops rendering this component; Radix still gets its close run, because
        // `FocusScope` does its unmount work (including `onCloseAutoFocus` below) from a cleanup.
        if (!next) onClose()
      }}
    >
      <Dialog.Portal>
        {/* The scrim IS the scroll container, as it was by hand: a tall panel scrolls the layer
            rather than the page behind it, and at 375px the 16px gutter is what keeps a dialog
            from being the one thing on the site with a horizontal scrollbar. */}
        <Dialog.Overlay
          /**
           * A press on the SCRIM closes the layer, on `mousedown` and only when the press starts on
           * the scrim itself -- which is what the hand-built overlay did, and the reason it gave:
           * a drag that begins on the panel and ends on the backdrop is not someone asking to
           * close.
           *
           * Radix would also dismiss this press, but on `click` rather than the press, and through
           * a document listener it arms a macrotask AFTER mount. That is a change of semantics and
           * a genuinely losable press: Chromium ranks input above timer tasks, so a click landing
           * in the same breath as the layer opening can arrive before the listener exists -- which
           * is reproducible, not theoretical. One line here, on React's own handler, makes the
           * press deterministic; everything else about dismissal (Escape, focus, the trap, the
           * scroll lock) is still Radix's.
           */
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
          /**
           * `max-sm:pt-24` is not decoration: the shell's top bar is sticky and sits ABOVE the
           * scrim on purpose (z-30, so the capture box stays usable while a layer is up), and
           * below 640px it is two rows tall -- taller than 8vh of a phone viewport, which sliced
           * the top off this layer's own heading. Screenshots at 375 are what caught it.
           */
          className="fixed inset-0 z-20 flex justify-center overflow-y-auto bg-scrim px-4 py-[8vh] max-sm:pt-24"
        >
          <Dialog.Content
            // No description: `aria-describedby` left dangling would point at nothing, and
            // Radix's own development warning is the thing asking for this.
            aria-describedby={undefined}
            /**
             * A MENU OPENED INSIDE THIS LAYER IS NOT OUTSIDE IT.
             *
             * Radix portals a `DropdownMenu`'s content to `document.body`, so to the dialog's own
             * outside-press detection a click on that menu lands outside the panel -- and the
             * whole dialog closed under the person's cursor while they were picking an attendee.
             * The menu is a layer ON TOP of this one; pressing in it is pressing inside the stack.
             *
             * Matched on the popper wrapper Radix puts around every floating layer rather than on
             * a role, so a listbox, a tooltip or a submenu is covered by the same line.
             */
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
              // Prevented, which also skips Radix's own "focus the trigger" -- there is no
              // trigger. A disconnected opener is left alone: focus has nowhere better to go than
              // where Radix would have put it.
              e.preventDefault()
              // Radix runs this a macrotask after the close, so by now SOMEONE ELSE may own the
              // keyboard: closing the shortcut list and pressing `f` opens search, and pulling
              // focus back to the toolbar button afterwards would undo it. Only a focus that fell
              // to <body> is ours to repair (WCAG 2.4.3) -- the same rule, and the same reason, as
              // the hand-built overlay's.
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
            className={`h-fit w-full max-w-[68ch] border border-border-strong bg-surface-raised ${className}`}
          >
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
              {/* Radix renders this as the h2 it was, and wires `aria-labelledby` to it -- so the
                  layer's accessible name is its visible heading rather than a second copy of the
                  same words in an `aria-label`. */}
              <Dialog.Title className="font-semibold text-fg">{title}</Dialog.Title>
              {dismissLabel !== null && (
                <Dialog.Close className="rounded-md px-2 py-1 text-sm text-fg-muted hover:text-fg">
                  {dismissLabel}
                </Dialog.Close>
              )}
            </div>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
