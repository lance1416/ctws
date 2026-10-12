import { BUTTON } from './buttonStyles'

/**
 * The in-page confirmation for a destructive delete: says what is lost, then Confirm / Cancel.
 * Shared by projects and tasks so there is one treatment. In the page, never window.confirm: a
 * browser modal blocks this project's automation. The confirm button takes focus; the owner
 * decides where focus goes when it ends.
 */
export function DeleteConfirm({
  label,
  message,
  busy,
  onConfirm,
  onCancel,
  className = '',
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
  className?: string
  /** The destroying button's word, for a thing that is not deleted -- a meeting is cancelled. */
  confirm?: string | undefined
  /** The way out's word. "Cancel" beside "Cancel meeting" would mean its opposite. */
  back?: string | undefined
}) {
  return (
    <div
      role="alertdialog"
      aria-label={label}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${className}`}
    >
      <p className="text-fg">{message}</p>
      {/* The way out first and the action last, as every pair of buttons in the app is ordered
          (`DialogFooter`, a pane's Cancel / Save) -- which also keeps the press that destroys
          the furthest from where the hand was. */}
      <span className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className={BUTTON.secondary}>
          {back}
        </button>
        <button
          autoFocus
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={BUTTON.destructive}
        >
          {confirm}
        </button>
      </span>
    </div>
  )
}
