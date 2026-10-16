import type { ReactNode } from 'react'
import { problemText } from '../http/api'
import { Button } from './Button'

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
  onCancel: () => void
  /** A line on the left, opposite the buttons -- the new task dialog's keyboard chord. */
  hint?: ReactNode
}) {
  return (
    <>
      {error != null && (
        <p role="alert" className="text-sm text-danger">
          {problemText(error) ?? "Couldn't create it. Your answers are still here — try again."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-4">
        {hint}
        <span className="ml-auto flex items-center gap-2">
          <Button look="secondary" onClick={onCancel}>
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
