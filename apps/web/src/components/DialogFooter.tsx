import { BUTTON } from './buttonStyles'

/**
 * HOW A "NEW THING" DIALOG ENDS: what went wrong, then the two ways out.
 *
 * Written twice, identically, for the new contact and the new meeting -- thirty lines each of
 * error paragraph, submit button and cancel button, down to the class strings. The third one
 * would have been a third copy, and the first thing to drift between them is the wording of a
 * failure, which is the sentence a person reads at the worst moment.
 */
export function DialogFooter({
  submit,
  error,
  busy,
  disabled,
  onCancel,
}: {
  /** The submit button's word. An action keeps the same name through the whole flow. */
  submit: string
  /** Whatever the write failed with, or null. */
  error: unknown
  busy: boolean
  disabled: boolean
  onCancel: () => void
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
      <div className="flex items-center gap-2">
        <button type="submit" disabled={disabled || busy} className={BUTTON.primary}>
          {submit}
        </button>
        <button type="button" onClick={onCancel} className={BUTTON.quiet}>
          Cancel
        </button>
      </div>
    </>
  )
}
