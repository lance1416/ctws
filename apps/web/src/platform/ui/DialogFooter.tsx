import type { ReactNode } from 'react'
import { problemText } from '../http/api'
import { Button } from './Button'
import { useCancel } from './Modal'

/** How a “new thing” dialog ends: the failure, then Cancel and the action, primary at the edge. */
export function DialogFooter({
  submit,
  error = null,
  busy = false,
  disabled = false,
  onCancel,
  hint,
}: {
  submit: string
  /** Whatever the write failed with, or null. A dialog with its own wording passes nothing. */
  error?: unknown
  busy?: boolean
  disabled?: boolean
  /** What Cancel lets go of; it asks first when something was typed (the layer's `unsaved`). */
  onCancel: () => void
  /** A line on the left, opposite the buttons -- the new task dialog's keyboard chord. */
  hint?: ReactNode
}) {
  const cancel = useCancel()
  return (
    <>
      {error != null && (
        <p role="alert" className="text-ui text-stop-t">
          {problemText(error) ?? "Couldn't create it. Your answers are still here — try again."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {hint}
        <span className="ml-auto flex items-center gap-2">
          <Button look="secondary" onClick={() => cancel(onCancel)}>
            Cancel
          </Button>
          <Button look="primary" type="submit" disabled={disabled || busy}>
            {submit}
          </Button>
        </span>
      </div>
    </>
  )
}
