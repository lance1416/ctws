import * as Dialog from '@radix-ui/react-dialog'
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { FindBar } from '../editor/FindBar'
import type { EditorHandle } from '../editor/MarkdownEditor'
import { outlineOf } from '../editor/outline'
import { OutlineButton, OutlineNav, useOutline, useSectionInSight } from '../editor/OutlineNav'
import { OUTLINE_KEYS, useNoteKeys } from '../editor/noteKeys'
import { readableWidth } from '../editor/measure'
import { SourceButton } from '../editor/SourceButton'
import { escapeInEditor } from '../editor/focused'
import { enterOverlay, exitOverlay } from '../keyboard/overlayState'
import { BUTTON } from '../ui/buttonStyles'
import { LAYER } from '../ui/layers'

/**
 * What the layer hands the editor it holds: the text and where every keystroke goes; its handle
 * and its Ctrl F, for the outline and the find bar; whether it shows the source.
 */
export type WritingField = {
  value: string
  onChange: (next: string) => void
  label: string
  handle: RefObject<EditorHandle | null>
  onFind: () => void
  source: boolean
}

/**
 * The account's choices for a whole page of writing (REQ-002 FR-109, FR-116), the same here as on
 * a note's page: the outline shown, the readable line length, the source.
 */
export type PageChoices = {
  outlineShown: boolean
  setOutlineShown: (on: boolean) => void
  readableLines: boolean
  sourceView: boolean
  setSourceView: (on: boolean) => void
}

/**
 * FULL SCREEN (REQ-002 FR-106, artboards 34 and 37, DES-001): the one editor over the whole window,
 * laid out as a note's page is, its outline a panel on the right that can be put away and Ctrl F's
 * bar over it; it draws the note as it will read, or shows its source, so there is no preview.
 * Esc or Leave full screen goes back. Every keystroke reports upward, so the unsaved-edit guard
 * sees edits made here. The editor is the caller's (`field`): this layer is the platform's, the
 * editor the shell's; so are the account's choices (`choices`).
 */
export function WritingMode({
  heading,
  source,
  problem = null,
  onChange,
  onClose,
  field,
  choices,
}: {
  heading: string
  /** Read once, on opening: a refetch behind the layer never replaces what is being typed. */
  source: string
  /** Why the text is not saved, when a caller saves it from in here. */
  problem?: string | null
  onChange: (next: string) => void
  onClose: () => void
  field: (props: WritingField) => ReactNode
  choices: PageChoices
}) {
  const [text, setText] = useState(source)
  const headings = useMemo(() => outlineOf(text), [text])
  const editor = useRef<EditorHandle | null>(null)
  const current = useSectionInSight(editor, headings)
  const outline = useOutline(choices.outlineShown, choices.setOutlineShown)
  const flipSource = () => choices.setSourceView(!choices.sourceView)
  // Full screen is an overlay, which the page-wide keys stand down for: these are its own.
  useNoteKeys(
    { outline: headings.length > 0 ? outline.toggle : undefined, source: flipSource },
    { inOverlay: true },
  )
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
            // Esc that is the find bar's is the bar's; the editor's (its `@` list, vim back to
            // NORMAL) is done here, as the editor will not see a key the layer has kept.
            const at = e.target instanceof Element ? e.target : null
            if (at?.closest('[role="search"]') || escapeInEditor()) e.preventDefault()
            // The outline floating over the text goes first (it puts itself away).
            else if (outline.narrow && outline.open) e.preventDefault()
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
            <div className="flex shrink-0 items-center gap-2">
              <SourceButton source={choices.sourceView} onSource={flipSource} />
              {headings.length > 0 && <OutlineButton outline={outline} keys={OUTLINE_KEYS} />}
              <Dialog.Close className={`shrink-0 ${BUTTON.secondary}`}>
                Leave full screen
              </Dialog.Close>
            </div>
          </div>
          {/* The status bar stays below it on a desk (its 24, `StatusBar`): vim's mode is there. */}
          {/* The text across the window, as on a note's page; the outline down its right. */}
          <div ref={outline.frame} className="relative flex min-h-0 flex-1 overflow-y-auto">
            <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-6 lg:px-10">
              <div
                className={`flex w-full flex-col gap-3 ${
                  choices.readableLines ? readableWidth(choices.sourceView) : ''
                }`}
              >
                {finding !== null && (
                  <FindBar
                    editor={editor.current}
                    nonce={finding}
                    onClose={() => setFinding(null)}
                  />
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
                  onFind: () => setFinding((n) => (n ?? 0) + 1),
                  source: choices.sourceView,
                })}
              </div>
            </div>
            <OutlineNav
              outline={outline}
              headings={headings}
              current={current}
              onJump={(h) => editor.current?.goTo(h.offset)}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
