import type { ReactNode } from 'react'

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
        <button
          type="submit"
          disabled={disabled || busy}
          className="h-9 rounded-lg bg-accent px-3 font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50"
        >
          {submit}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-lg px-3 text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </>
  )
}
