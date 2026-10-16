import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { enterOverlay, exitOverlay } from '../keyboard/overlayState'
import { BUTTON } from './buttonStyles'
import { LAYER } from './layers'

/**
 * A modal layer on Radix's Dialog: focus trap, Escape and press-outside are Radix's, the look is
 * ours. The detail pane is not one of these: it has to coexist with the list it opened from.
 */
export function Modal({
  title,
  onClose,
  initialFocus,
  dismissLabel = 'Close',
  children,
}: {
  title: string
  onClose: () => void
  /** What takes focus when the layer opens, instead of the first tabbable thing. */
  initialFocus?: RefObject<HTMLElement | null>
  /** The header's own dismiss control. `null` on a layer whose footer already carries Cancel. */
  dismissLabel?: string | null
  children: ReactNode
}) {
  // These layers have no trigger element (`?` and `n` are keys), so the opener is captured during
  // render, before Radix moves focus into the panel, and focus goes back to it on close.
  const opener = useRef<Element | null>(null)
  if (opener.current === null) opener.current = document.activeElement

  // The document-level single keys (`/`, `f`, `?`, the `g` chords) stand down under a layer.
  useEffect(() => {
    enterOverlay()
    return exitOverlay
  }, [])

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <Dialog.Portal>
        {/* The scrim is the scroll container, so a tall panel scrolls the layer, not the page. */}
        <Dialog.Overlay
          // Closed on the press, and only one that starts on the scrim: Radix's own outside click
          // is armed a macrotask after mount and can miss a press made as the layer opens.
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
          // `max-sm:pt-24`: the top bar stays above the scrim and is two rows tall on a phone.
          className={`fixed inset-0 ${LAYER.pane} flex justify-center overflow-y-auto bg-scrim px-4 py-[8vh] max-sm:pt-24`}
        >
          <Dialog.Content
            aria-describedby={undefined}
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
            className="h-fit w-full max-w-reading rounded-card bg-float shadow-float"
          >
            <div className="flex items-center justify-between border-b border-rule px-5 py-3">
              <Dialog.Title className="font-semibold text-ink">{title}</Dialog.Title>
              {dismissLabel !== null && (
                <Dialog.Close className={BUTTON.inline}>{dismissLabel}</Dialog.Close>
              )}
            </div>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
