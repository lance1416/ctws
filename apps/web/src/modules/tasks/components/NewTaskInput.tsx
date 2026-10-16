import { useId, useRef, useState } from 'react'
import { HANG_WIDTH } from '../../../platform/ui/hang'
import { BODY_GUTTER } from '../../../shell/rows/RowParts'
import { CHEVRON_PX, gutterPlus, HANDLE_PX, INDENT_PX } from './TaskRowParts'
import { useComposing } from '../../../platform/keyboard/composition'

// The width of `StatusButton`, not of its glyph, so the input lines up with the rows' titles.
const MARK_PX = 28

type Props = {
  /** Depth of the task this input creates; a root task is 1. Indents it into place. */
  depth: number
  /** Resolves true when the task was created, so the input can clear and stay open. */
  onCommit: (title: string) => Promise<boolean>
  /** Why the last attempt failed, said under the box rather than above the whole tree. */
  error: string | null
  /** `restoreFocus` is false when the user left by clicking elsewhere. */
  onCancel: (restoreFocus: boolean) => void
}

// One input at the end of a sibling group. Enter creates and stays open for the next one;
// Escape, Enter on an empty box, or blurring an empty box leaves.
export function NewTaskInput({ depth, onCommit, onCancel, error }: Props) {
  const composing = useComposing()
  const [title, setTitle] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const describedBy = useId()

  const submit = async () => {
    const t = title.trim()
    if (!t) return onCancel(true)
    if (await onCommit(t)) {
      setTitle('')
      input.current?.focus()
    }
  }

  return (
    // The row's anatomy with the margin and thread left empty: the cursor starts where titles do.
    <li data-depth={depth} data-new-task className="flex items-stretch">
      <span aria-hidden="true" className={`shrink-0 ${HANG_WIDTH}`} />
      <span aria-hidden="true" className="w-[3px] shrink-0" />
      {/* A column, so the failure message sits under the box it is about. */}
      <div
        style={{
          paddingLeft: gutterPlus((depth - 1) * INDENT_PX + HANDLE_PX + CHEVRON_PX + MARK_PX + 8),
        }}
        className={`flex min-w-0 flex-1 flex-col justify-center ${BODY_GUTTER}`}
      >
        <div className="flex min-h-11 items-center">
          <input
            ref={input}
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            {...composing.bind}
            onKeyDown={(e) => {
              // isComposing: Enter confirms an IME candidate, it must not submit half a word.
              if (e.key === 'Enter' && !composing.composingNow(e)) {
                e.preventDefault()
                void submit()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                onCancel(true)
              }
            }}
            onBlur={() => {
              if (!title.trim()) onCancel(false)
            }}
            placeholder="Enter to add, Esc to cancel"
            aria-label="Add a task"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? describedBy : undefined}
            className={`h-8 w-full border-b bg-transparent text-base text-ink placeholder:text-ink-muted ${
              error ? 'border-danger' : 'border-rule-strong'
            }`}
          />
        </div>
        {/* The typed title stays in the box after a failure. */}
        {error && (
          <p id={describedBy} role="alert" className="pb-1 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </li>
  )
}
