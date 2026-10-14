import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState } from 'react'
import { enterOverlay, exitOverlay } from '../keyboard/overlayState'
import { NoteBody } from './NoteBody'
import { BUTTON } from '../ui/buttonStyles'
import { LAYER } from '../ui/layers'

/**
 * THE FULL-SCREEN WRITING MODE -- design artboard H, and the escape hatch of editing model A.
 *
 * THE EDITING MODEL: reading mode is primary, Edit opens a plain text area over the Markdown
 * SOURCE, and a long note gets this. It exists because the detail pane is 22rem wide: a 68ch
 * measure is right for READING a note and hopeless for writing a page of one. Deliberately not a
 * side-by-side preview inside the pane, and not a WYSIWYG.
 *
 * It is also the seed of a notes module. Nothing here knows what a task is: it takes a
 * heading, a string, and a way to report a new string.
 *
 * WHAT IT IS NOT ALLOWED TO BREAK:
 *   - The source is the only thing stored. The textarea holds Markdown, the right-hand side is a
 *     rendering of it, and closing hands back exactly the characters that were typed.
 *   - The unsaved-edit guard. Every keystroke here reports upward through the same
 *     `setValue(..., { shouldDirty: true })` the pane's own textarea does, so `isDirty`, the router
 *     blocker and the log-out guard all see an edit made in here. The pane CLOSES this layer when
 *     the guard has something to ask (`TaskDetail`), because a question nobody can see is not a
 *     guard.
 *   - The single-key shortcuts stand down while it is open (`enterOverlay`), or `/` typed into a
 *     note would open the search dialog.
 */
export function WritingMode({
  heading,
  source,
  onChange,
  onClose,
}: {
  heading: string
  source: string
  onChange: (next: string) => void
  onClose: () => void
}) {
  /**
   * The text lives here while the layer is open, and is pushed upward on every keystroke.
   *
   * Local state as well as the form's, for one reason: the PREVIEW is debounced and the TEXTAREA
   * must not be. A preview driven straight off the form would re-render mermaid on every character,
   * and a textarea driven off a debounced value would drop keystrokes.
   */
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
        {/* Opaque and full-bleed: nothing else is on screen, the top bar included. */}
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
              {/* The hint costs two lines of a phone's writing area, which is the scarcest space
                  this layer has; the two controls it describes are both on screen anyway. */}
              <p className="text-xs text-ink-muted max-sm:hidden">
                Leave full screen to go back. Saving still happens in the pane.
              </p>
            </div>
            <Dialog.Close className={`shrink-0 ${BUTTON.secondary}`}>
              Leave full screen
            </Dialog.Close>
          </div>
          {/*
            SOURCE ON ONE SIDE, RESULT ON THE OTHER -- side by side once there is room for two
            readable measures, stacked below that. At 375px two columns would be two unusable
            columns, and "no horizontal scroll at 375px" is pinned app-wide; stacking keeps both halves at a
            full width each and the page at one scroll direction.

            THE ROWS ARE EXPLICIT (`grid-rows-2`), not automatic. With automatic rows the stacked
            layout sized each half to its CONTENT, so a long note's preview took the whole window
            and left the textarea about 70px tall with its own lines clipped -- which the 375
            screenshot showed. Two equal tracks, each scrolling itself, is what a writing mode
            needs: half the window is always the thing being typed.
          */}
          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
            <div className="flex min-h-0 flex-col border-rule max-lg:border-b lg:border-r">
              <label htmlFor="writing-source" className="px-4 pt-3 text-xs text-ink-muted">
                {/* “Markdown source” and not “Notes”: the pane's own textarea is still mounted behind
                    this layer, accessible names share one flat namespace, and an exact match for
                    Notes must keep meaning the one field it has always meant. */}
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
                // `font-mono` is the `--font-mono` token: this pane shows Markdown
                // SOURCE, where a fence's alignment and a table's pipes are the thing being read.
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
