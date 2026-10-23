import { useId, useRef } from 'react'
import { titleStart, TREE_ROW } from './TaskRowParts'
import { useLineEntry } from '../../../platform/ui/useLineEntry'

type Props = {
  /** Depth of the task this input creates; a root task is 1. Indents it into place. */
  depth: number
  /** Resolves true when the task was created and the list has it, so the box can take the next. */
  onCommit: (title: string) => Promise<boolean>
  /** Why the last attempt failed, said under the box rather than above the whole tree. */
  error: string | null
  /** `restoreFocus` is false when the user left by clicking elsewhere. */
  onCancel: (restoreFocus: boolean) => void
}

// One input at the end of a sibling group. Enter creates and stays open for the next one;
// Escape, Enter on an empty box, or blurring an empty box leaves.
export function NewTaskInput({ depth, onCommit, onCancel, error }: Props) {
  const title = useLineEntry()
  const input = useRef<HTMLInputElement>(null)
  const describedBy = useId()

  return (
    // Across the row's columns, the cursor where titles start.
    <li data-depth={depth} data-new-task className={TREE_ROW}>
      {/* A column, so the failure message sits under the box it is about. */}
      <div
        style={{ paddingLeft: titleStart(depth) }}
        className="col-span-full flex min-w-0 flex-col justify-center"
      >
        <div className="flex min-h-9 items-center">
          <input
            ref={input}
            autoFocus
            {...title.field({
              // Emptied only once the create is through: an Enter before then is dropped.
              onSubmit: (text) =>
                void onCommit(text).then((made) => {
                  if (!made) return
                  title.sent(text)
                  input.current?.focus()
                }),
              onEmpty: () => onCancel(true),
              onCancel: () => onCancel(true),
            })}
            onBlur={() => {
              if (!title.value.trim()) onCancel(false)
            }}
            placeholder="Enter to add, Esc to cancel"
            aria-label="Add a task"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? describedBy : undefined}
            className={`h-7 w-full border-b bg-transparent text-ui text-ink placeholder:text-muted ${
              error ? 'border-stop' : 'border-line-strong'
            }`}
          />
        </div>
        {/* The typed title stays in the box after a failure. */}
        {error && (
          <p id={describedBy} role="alert" className="pb-1 text-ui text-stop-t">
            {error}
          </p>
        )}
      </div>
    </li>
  )
}
