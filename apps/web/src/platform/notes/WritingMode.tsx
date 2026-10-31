import * as Dialog from '@radix-ui/react-dialog'
import { type ReactNode, useEffect, useState } from 'react'
import { enterOverlay, exitOverlay } from '../keyboard/overlayState'
import { BUTTON } from '../ui/buttonStyles'
import { LAYER } from '../ui/layers'

/** What the layer hands the editor it holds: the text, and where every keystroke goes. */
export type WritingField = { value: string; onChange: (next: string) => void; label: string }

/**
 * FULL SCREEN (REQ-002 FR-106, artboard 34 "Whole page"): the one editor over the whole window, at
 * the reading measure; it draws the note as it will read, so there is no preview beside it. Every
 * keystroke reports upward, so the unsaved-edit guard sees edits made here. The editor is the
 * caller's (`field`): this layer is the platform's, the editor the shell's.
 */
export function WritingMode({
  heading,
  source,
  problem = null,
  onChange,
  onClose,
  field,
}: {
  heading: string
  /** Read once, on opening: a refetch behind the layer never replaces what is being typed. */
  source: string
  /** Why the text is not saved, when a caller saves it from in here. */
  problem?: string | null
  onChange: (next: string) => void
  onClose: () => void
  field: (props: WritingField) => ReactNode
}) {
  const [text, setText] = useState(source)

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
        <Dialog.Overlay className={`fixed inset-0 ${LAYER.cover} bg-panel`} />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Into the text, the editor or the box standing in for it while it loads.
            e.preventDefault()
            if (e.currentTarget instanceof HTMLElement)
              e.currentTarget.querySelector<HTMLElement>('.cm-content, textarea')?.focus()
          }}
          className={`fixed inset-0 ${LAYER.cover} flex flex-col bg-panel text-ink focus:outline-none`}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-subject">{heading}</Dialog.Title>
              <p className="text-meta text-muted max-sm:hidden">
                Leave full screen to go back. Saving still happens in the pane.
              </p>
              {problem && (
                <p role="alert" className="text-meta text-stop-t">
                  {problem}
                </p>
              )}
            </div>
            <Dialog.Close className={`shrink-0 ${BUTTON.secondary}`}>
              Leave full screen
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto max-w-reading">
              {field({
                value: text,
                onChange: (next) => {
                  setText(next)
                  onChange(next)
                },
                // Not "Notes": the pane's own field is still mounted behind this layer.
                label: 'Writing',
              })}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
