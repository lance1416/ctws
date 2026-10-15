import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState } from 'react'
import { enterOverlay, exitOverlay } from '../keyboard/overlayState'
import { NoteBody } from './NoteBody'
import { BUTTON } from '../ui/buttonStyles'
import { LAYER } from '../ui/layers'

/**
 * A full-screen editor for a note's Markdown source, beside its preview. Every keystroke reports
 * upward, so the unsaved-edit guard sees edits made here.
 */
export function WritingMode({
  heading,
  source,
  problem = null,
  onChange,
  onClose,
}: {
  heading: string
  /** Read once, on opening: a refetch behind the layer never replaces what is being typed. */
  source: string
  /** Why the text is not saved, when a caller saves it from in here. */
  problem?: string | null
  onChange: (next: string) => void
  onClose: () => void
}) {
  // Local text so the preview can be debounced while the textarea is not.
  const [text, setText] = useState(source)
  const [preview, setPreview] = useState(source)
  useEffect(() => {
    const t = setTimeout(() => setPreview(text), 250)
    return () => clearTimeout(t)
  }, [text])

  useEffect(() => {
    enterOverlay()
    return exitOverlay
  }, [])

  const area = useRef<HTMLTextAreaElement>(null)

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={`fixed inset-0 ${LAYER.cover} bg-sheet`} />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            area.current?.focus()
          }}
          className={`fixed inset-0 ${LAYER.cover} flex flex-col bg-sheet text-ink focus:outline-none`}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-lg font-semibold">{heading}</Dialog.Title>
              <p className="text-xs text-ink-muted max-sm:hidden">
                Leave full screen to go back. Saving still happens in the pane.
              </p>
              {problem && (
                <p role="alert" className="text-xs text-danger">
                  {problem}
                </p>
              )}
            </div>
            <Dialog.Close className={`shrink-0 ${BUTTON.secondary}`}>
              Leave full screen
            </Dialog.Close>
          </div>
          {/* Explicit equal rows when stacked: automatic rows let a long preview squeeze the
              textarea to a sliver. */}
          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
            <div className="flex min-h-0 flex-col border-rule max-lg:border-b lg:border-r">
              <label htmlFor="writing-source" className="px-4 pt-3 text-xs text-ink-muted">
                {/* Not “Notes”: the pane's Notes textarea is still mounted behind this layer. */}
                Markdown source
              </label>
              <textarea
                id="writing-source"
                ref={area}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  onChange(e.target.value)
                }}
                spellCheck={false}
                className="min-h-0 flex-1 resize-none bg-sheet px-4 py-3 font-mono text-sm text-ink focus:outline-none"
              />
            </div>
            <div className="min-h-0 overflow-y-auto px-4 py-3">
              <span className="text-xs text-ink-muted">Preview</span>
              <div data-writing-preview className="mt-1 max-w-[68ch]">
                {preview.trim() === '' ? (
                  <p className="text-sm text-ink-subtle">No notes yet</p>
                ) : (
                  <NoteBody source={preview} />
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
