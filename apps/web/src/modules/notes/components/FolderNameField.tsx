import { useRef, useState } from 'react'
import { useComposing } from '../../../platform/keyboard/composition'
import { inlineEditProps } from '../../../platform/ui/useInlineEdit'

/**
 * A folder's name written in its row (FR-110): a new folder's, or a rename. Enter keeps it, Esc
 * or leaving it empty backs out; a name already taken says so under it and stays to be changed.
 */
export function FolderNameField({
  initial = '',
  label,
  error,
  onCommit,
  onCancel,
}: {
  initial?: string
  label: string
  /** Why the last name was not kept. */
  error: string | null
  onCommit: (name: string) => void
  onCancel: () => void
}) {
  const composing = useComposing()
  const [name, setName] = useState(initial)
  // The name last sent: Enter, then the blur that follows it, send it once.
  const sent = useRef<string | null>(null)
  // Backed out of: the blur of a field going away keeps nothing.
  const closed = useRef(false)
  const cancel = () => {
    closed.current = true
    onCancel()
  }
  const commit = () => {
    if (closed.current) return
    const kept = name.trim()
    if (!kept || kept === initial) cancel()
    else if (kept !== sent.current) {
      sent.current = kept
      onCommit(kept)
    }
  }
  return (
    <div className="mx-1.5 flex flex-col gap-1 pb-1">
      <input
        aria-label={label}
        aria-invalid={error ? true : undefined}
        value={name}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        {...inlineEditProps(composing, { onCommit: commit, onCancel: cancel })}
        className="h-7.5 rounded-control border border-line bg-panel px-2 text-ui text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-task"
      />
      {error && (
        <p role="alert" className="px-2 text-meta text-stop-t">
          {error}
        </p>
      )}
    </div>
  )
}
