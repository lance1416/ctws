import { useRef, useState } from 'react'
import { LEAD_GAP_PX, LEAD_SLOT_PX } from '../rowLead'
import { CHEVRON_PX, HANDLE_PX, INDENT_PX, RAIL_GUTTER_PX } from './RowParts'

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
  /** `restoreFocus` is false when the user left by clicking elsewhere. */
  onCancel: (restoreFocus: boolean) => void
}

// One input at the end of a sibling group. Enter creates and stays open for the next one;
// Escape, Enter on an empty box, or blurring an empty box leaves.
export function NewTaskInput({ depth, leadSlot, onCommit, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const input = useRef<HTMLInputElement>(null)

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
      className="flex min-h-11 items-center"
    >
      <input
        ref={input}
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          // isComposing: Enter confirms an IME candidate, it must not submit half a word.
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
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
        placeholder="回车添加，Esc 取消"
        aria-label="添加任务"
        className="h-8 w-full border-b border-border-strong bg-transparent text-[15px] text-fg placeholder:text-fg-muted"
      />
    </li>
  )
}
