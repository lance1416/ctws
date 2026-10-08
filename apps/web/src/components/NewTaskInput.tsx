import { useId, useRef, useState } from 'react'
import { LEAD_GAP_PX, LEAD_SLOT_PX } from '../rowLead'
import { CHEVRON_PX, HANDLE_PX, INDENT_PX, RAIL_GUTTER_PX } from './RowParts'
import { useComposing } from '../composition'

// The status marker's COLUMN -- the width of `StatusButton`, not of the glyph inside it -- so the
// input lines up with the TITLE of the rows around it rather than with the marker.
const MARK_PX = 28

type Props = {
  /** Depth of the task this input creates; a root task is 1. Indents it into place. */
  depth: number
  /** Whether the tree around it reserves the leading icon slot: the input clears it too, so the
   *  cursor starts where the titles start rather than 28px to their left. */
  leadSlot: boolean
  /** Resolves true when the task was created, so the input can clear and stay open. */
  onCommit: (title: string) => Promise<boolean>
  /** Why the last attempt failed, said HERE rather than above the whole tree (D53). */
  error?: string | null
  /** `restoreFocus` is false when the user left by clicking elsewhere. */
  onCancel: (restoreFocus: boolean) => void
}

// One input at the end of a sibling group. Enter creates and stays open for the next one;
// Escape, Enter on an empty box, or blurring an empty box leaves.
export function NewTaskInput({ depth, leadSlot, onCommit, onCancel, error }: Props) {
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
    <li
      data-depth={depth}
      data-new-task
      style={{
        paddingLeft:
          RAIL_GUTTER_PX +
          (depth - 1) * INDENT_PX +
          HANDLE_PX +
          CHEVRON_PX +
          MARK_PX +
          8 +
          (leadSlot ? LEAD_SLOT_PX + LEAD_GAP_PX : 0),
      }}
      // A column, not a row: the failure message belongs UNDER the box it is about. The box
      // itself keeps the row height it had, so a tree with no error looks exactly as before.
      className="flex flex-col justify-center"
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
          className={`h-8 w-full border-b bg-transparent text-base text-fg placeholder:text-fg-muted ${
            error ? 'border-danger' : 'border-border-strong'
          }`}
        />
      </div>
      {/* The typed title is deliberately still in the box above: what was typed is the user's,
          not the request's, and retyping it is the cost of a failure they did not cause. */}
      {error && (
        <p id={describedBy} role="alert" className="pb-1 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  )
}
