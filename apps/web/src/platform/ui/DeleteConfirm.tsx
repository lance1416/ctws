import { Button } from './Button'

/**
 * The in-page question before a destructive action: what is lost, then Cancel and the action.
 * Cancel takes focus, so a held or repeated Enter backs out instead of destroying.
 */
export function DeleteConfirm({
  label,
  message,
  busy,
  onConfirm,
  onCancel,
  confirm = 'Confirm delete',
  back = 'Cancel',
}: {
  /** The accessible name of the dialog. */
  label: string
  message: string
  /** True until the owner can say what is lost, and while the delete is in flight. */
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
  /** The destroying button's word, for a thing that is not deleted (a meeting is cancelled). */
  confirm?: string | undefined
  /** The way out's word. "Cancel" beside "Cancel meeting" would mean its opposite. */
  back?: string | undefined
}) {
  return (
    <div
      role="alertdialog"
      aria-label={label}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
    >
      <p className="text-ink">{message}</p>
      <span className="flex items-center gap-2">
        <Button look="secondary" autoFocus onClick={onCancel}>
          {back}
        </Button>
        <Button look="destructive" disabled={busy} onClick={onConfirm}>
          {confirm}
        </Button>
      </span>
    </div>
  )
}
