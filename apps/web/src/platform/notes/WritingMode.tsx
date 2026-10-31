import * as Dialog from '@radix-ui/react-dialog'
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { FindBar } from '../editor/FindBar'
import type { EditorHandle } from '../editor/MarkdownEditor'
import { outlineOf, sectionAt } from '../editor/outline'
import { OutlineNav } from '../editor/OutlineNav'
import { enterOverlay, exitOverlay } from '../keyboard/overlayState'
import { BUTTON } from '../ui/buttonStyles'
import { LAYER } from '../ui/layers'

/**
 * What the layer hands the editor it holds: the text and where every keystroke goes; its handle,
 * its cursor and its Ctrl F, for the outline and the find bar.
 */
export type WritingField = {
  value: string
  onChange: (next: string) => void
  label: string
  handle: RefObject<EditorHandle | null>
  onCursor: (offset: number) => void
  onFind: () => void
}

/**
 * FULL SCREEN (REQ-002 FR-106, artboard 34 "Whole page", DES-001): the one editor over the whole
 * window, at the reading measure, with the outline beside it when the text has headings and Ctrl
 * F's bar over it; it draws the note as it will read, so there is no preview. Esc or Leave full
 * screen goes back. Every keystroke reports upward, so the unsaved-edit guard sees edits made
 * here. The editor is the caller's (`field`): this layer is the platform's, the editor the shell's.
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
  const headings = useMemo(() => outlineOf(text), [text])
  const [cursor, setCursor] = useState(0)
  const editor = useRef<EditorHandle | null>(null)
  // Ctrl F's bar while it is open, counting the presses that opened it.
  const [finding, setFinding] = useState<number | null>(null)

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
        <Dialog.Overlay
          className={`fixed inset-x-0 top-0 bottom-0 lg:bottom-6 ${LAYER.cover} bg-panel`}
        />
        <Dialog.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => {
            // Esc that is the find bar's or the `@` list's closes those, not the layer.
            const at = e.target instanceof Element ? e.target : null
            if (
              at?.closest('[role="search"]') ||
              document.querySelector('.cm-tooltip-autocomplete')
            )
              e.preventDefault()
          }}
          onOpenAutoFocus={(e) => {
            // Into the text, the editor or the box standing in for it while it loads.
            e.preventDefault()
            if (e.currentTarget instanceof HTMLElement)
              e.currentTarget.querySelector<HTMLElement>('.cm-content, textarea')?.focus()
          }}
          className={`fixed inset-x-0 top-0 bottom-0 lg:bottom-6 ${LAYER.cover} flex flex-col bg-panel text-ink focus:outline-none`}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-subject">{heading}</Dialog.Title>
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
          {/* The status bar stays below it on a desk (its 24, `StatusBar`): vim's mode is there. */}
          {/* The text in the middle; with headings, the outline beside it, the pair centred. */}
          <div className="flex min-h-0 flex-1 justify-center gap-10 overflow-y-auto px-4 py-6">
            <div className="flex w-full max-w-reading min-w-0 flex-col gap-3">
              {finding !== null && (
                <FindBar editor={editor.current} nonce={finding} onClose={() => setFinding(null)} />
              )}
              {field({
                value: text,
                onChange: (next) => {
                  setText(next)
                  onChange(next)
                },
                // Not "Notes": the pane's own field is still mounted behind this layer.
                label: 'Writing',
                handle: editor,
                onCursor: setCursor,
                onFind: () => setFinding((n) => (n ?? 0) + 1),
              })}
            </div>
            <OutlineNav
              headings={headings}
              current={sectionAt(headings, cursor)}
              onJump={(h) => editor.current?.goTo(h.offset)}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
