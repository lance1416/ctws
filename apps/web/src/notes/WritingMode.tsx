import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState } from 'react'
import { enterOverlay, exitOverlay } from '../components/overlayState'
import { NoteBody } from './NoteBody'

/**
 * THE FULL-SCREEN WRITING MODE -- design artboard H, and the escape hatch of editing model A.
 *
 * The model the user chose from three was **A**: reading mode is primary, 编辑 opens a plain text
 * area over the Markdown SOURCE, and a long note gets a full-screen writing mode. This is that
 * third piece, and the reason it exists is that the detail pane is 22rem wide: a 68ch measure is
 * right for READING a note and hopeless for writing a page of one. It is deliberately NOT the
 * side-by-side preview inside the pane (option B) nor a WYSIWYG (option C) -- both were considered
 * and declined.
 *
 * It is also the seed of the notes module D73 names. Nothing here knows what a task is: it takes a
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
        {/*
          OPAQUE AND FULL-BLEED, not a scrim with a panel on it. A writing mode's whole claim is
          that nothing else is on screen, and z-40 is above the sticky top bar (z-30) -- the one
          layer in this app that deliberately covers it.
        */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-surface" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            area.current?.focus()
          }}
          className="fixed inset-0 z-40 flex flex-col bg-surface text-fg focus:outline-none"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-lg font-semibold">{heading}</Dialog.Title>
              {/* The hint costs two lines of a phone's writing area, which is the scarcest space
                  this layer has; the two controls it describes are both on screen anyway. */}
              <p className="text-xs text-fg-muted max-sm:hidden">
                Leave full screen to go back. Saving still happens in the pane.
              </p>
            </div>
            <Dialog.Close className="h-9 shrink-0 rounded-lg border border-border-strong px-3 text-sm text-fg hover:bg-surface-hover">
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
            <div className="flex min-h-0 flex-col border-border-subtle max-lg:border-b lg:border-r">
              <label htmlFor="writing-source" className="px-4 pt-3 text-xs text-fg-muted">
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
                // `font-mono` is the typography spec's `--font-mono` token: this pane shows Markdown
                // SOURCE, where a fence's alignment and a table's pipes are the thing being read.
                className="min-h-0 flex-1 resize-none bg-surface px-4 py-3 font-mono text-sm text-fg focus:outline-none"
              />
            </div>
            <div className="min-h-0 overflow-y-auto px-4 py-3">
              <span className="text-xs text-fg-muted">Preview</span>
              <div data-writing-preview className="mt-1 max-w-[68ch]">
                {preview.trim() === '' ? (
                  <p className="text-sm text-fg-subtle">No notes yet</p>
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
