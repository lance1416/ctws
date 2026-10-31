import { useEffect, useRef, useState } from 'react'
import type { EditorHandle } from '../../../platform/editor/MarkdownEditor'
import { CloseIcon, FindNextIcon, FindPreviousIcon, PLACE_ICON } from '../../../platform/ui/icons'

const STEP =
  'grid size-7 place-items-center rounded-control text-muted hover:bg-hover hover:text-ink disabled:opacity-40'

/**
 * CTRL F IN A NOTE (REQ-002 FR-109, artboard 34): the words, which place of how many the bar is
 * on, the one before and the next, and ×. Enter is the next, Shift Enter the one before, Esc
 * closes it and goes back to the text, the place it was on selected. `nonce` grows with each
 * Ctrl F, which takes the bar's words again whole.
 */
export function FindBar({
  editor,
  nonce,
  onClose,
}: {
  editor: EditorHandle | null
  nonce: number
  onClose: () => void
}) {
  const box = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState({ count: 0, index: -1 })
  useEffect(() => {
    box.current?.select()
  }, [nonce])
  const close = () => {
    editor?.findDone()
    onClose()
  }
  const step = (by: 1 | -1) => editor && setFound(editor.findStep(by))
  return (
    <div
      role="search"
      aria-label="Find in this note"
      // A box round a bare input: the app's ring is the box's (DES-001 section 4).
      data-field
      className="flex h-10 max-w-[68ch] items-center gap-1 rounded-control border border-line bg-float pr-1 pl-3"
    >
      <PLACE_ICON.search size={16} aria-hidden="true" className="shrink-0 text-muted" />
      <input
        ref={box}
        aria-label="Find"
        value={query}
        autoFocus
        onChange={(e) => {
          setQuery(e.target.value)
          if (editor) setFound(editor.find(e.target.value))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
        className="min-w-0 flex-1 bg-transparent pl-2 text-ui text-ink outline-none"
      />
      {query && (
        <span aria-live="polite" className="shrink-0 px-2 text-meta text-muted tabular-nums">
          {found.count === 0 ? 'No matches' : `${found.index + 1} of ${found.count}`}
        </span>
      )}
      <button
        type="button"
        aria-label="Previous match"
        disabled={found.count === 0}
        onClick={() => step(-1)}
        className={STEP}
      >
        <FindPreviousIcon size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Next match"
        disabled={found.count === 0}
        onClick={() => step(1)}
        className={STEP}
      >
        <FindNextIcon size={16} aria-hidden="true" />
      </button>
      <button type="button" aria-label="Close find" onClick={close} className={STEP}>
        <CloseIcon size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
