import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { enterOverlay, exitOverlay } from '../keyboard/overlayState'
import { CloseIcon } from './icons'
import { ICON_BUTTON } from './buttonStyles'

/** How far the bar is pulled down before letting go closes the sheet. */
const CLOSE_AFTER_PX = 80

/**
 * A SHEET FROM THE FOOT (DES-001 "从底部弹出的面板"), the phone's way to show what the desk
 * shows beside or over a page: a day picked, a choice, the capture box. `full` takes the whole
 * screen but the status bar. Its head is the title and ×; pulling the head down also closes it.
 */
export function BottomSheet({
  title,
  onClose,
  full = false,
  initialFocus,
  head = true,
  about,
  children,
}: {
  title: string
  onClose: () => void
  full?: boolean
  initialFocus?: RefObject<HTMLElement | null>
  /** The title row; a sheet whose body draws its own head (a picker's box) leaves it out. */
  head?: boolean
  /** A line under the title, subtle and cut to fit: what the sheet is about ("Move to" what). */
  about?: string
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const pull = useRef<{ from: number; by: number } | null>(null)
  // The document's single keys stand down while it is up, as under any layer.
  useEffect(() => {
    enterOverlay()
    return exitOverlay
  }, [])
  const grab = {
    onPointerDown: (e: React.PointerEvent) => {
      pull.current = { from: e.clientY, by: 0 }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!pull.current || !panel.current) return
      pull.current.by = Math.max(0, e.clientY - pull.current.from)
      panel.current.style.transform = `translateY(${pull.current.by}px)`
    },
    onPointerUp: () => {
      const by = pull.current?.by ?? 0
      pull.current = null
      if (by > CLOSE_AFTER_PX) onClose()
      else if (panel.current) panel.current.style.transform = ''
    },
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <Dialog.Content
          ref={panel}
          aria-describedby={undefined}
          onOpenAutoFocus={
            initialFocus &&
            ((e) => {
              e.preventDefault()
              initialFocus.current?.focus()
            })
          }
          className={`fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-phone-sheet bg-float pb-[env(safe-area-inset-bottom)] shadow-float ${
            full ? 'top-[env(safe-area-inset-top)] min-h-0' : 'max-h-[92dvh]'
          }`}
        >
          <div {...grab} className="flex shrink-0 touch-none justify-center pt-2 pb-1">
            <span aria-hidden="true" className="h-1 w-9 rounded-full bg-line-strong" />
          </div>
          {head ? (
            <div {...grab} className="flex min-h-11 shrink-0 touch-none items-center gap-2 px-4">
              <span className="flex min-w-0 flex-1 flex-col">
                <Dialog.Title className="truncate text-subject text-ink">{title}</Dialog.Title>
                {about && <span className="truncate text-ui text-subtle">{about}</span>}
              </span>
              <Dialog.Close aria-label="Close" className={ICON_BUTTON}>
                <CloseIcon size={18} aria-hidden="true" />
              </Dialog.Close>
            </div>
          ) : (
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
          )}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
