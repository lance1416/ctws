import type { ReactNode } from 'react'
import { BUTTON } from './buttonStyles'

/**
 * HOW A "NEW THING" DIALOG ENDS: what went wrong, then the two ways out.
 *
 * Written twice, identically, for the new person and the new meeting -- thirty lines each of
 * error paragraph, submit button and cancel button, down to the class strings. The third one
 * would have been a third copy, and the first thing to drift between them is the wording of a
 * failure, which is the sentence a person reads at the worst moment.
 *
 * THE SAME TWO BUTTONS IN THE SAME ORDER AS A PANE'S EDIT: Cancel, then the action, at the right.
 * The new task dialog had its own footer with the action first, so a dialog and a pane put Save
 * and Cancel in opposite places; and the way out was `quiet` here and `secondary` everywhere else.
 * The primary sits last, at the edge, wherever there is one.
 */
export function DialogFooter({
  submit,
  error = null,
  busy = false,
  disabled = false,
  onCancel,
  hint,
}: {
  /** The submit button's word. An action keeps the same name through the whole flow. */
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
          {/* The form is still filled in -- saying so is the difference between "try again" and
              "type it all again". */}
          {error instanceof Error
            ? error.message
            : "Couldn't create it. Your answers are still here — try again."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
        {hint}
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onCancel} className={BUTTON.secondary}>
            Cancel
          </button>
          <button type="submit" disabled={disabled || busy} className={BUTTON.primary}>
            {submit}
          </button>
        </span>
      </div>
    </>
  )
}
