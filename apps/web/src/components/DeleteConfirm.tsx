/**
 * The in-page confirmation for a destructive delete: says what is lost, then 确认删除 / 取消.
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
}: {
  /** The accessible name of the dialog. */
  label: string
  message: string
  /** True until the owner can say what is lost, and while the delete is in flight. */
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
  className?: string
}) {
  return (
    <div
      role="alertdialog"
      aria-label={label}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${className}`}
    >
      <p className="text-fg">{message}</p>
      <button
        autoFocus
        type="button"
        disabled={busy}
        onClick={onConfirm}
        className="h-9 rounded-lg bg-danger px-3 font-semibold text-danger-fg hover:opacity-90 disabled:opacity-50"
      >
        Confirm delete
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="h-9 rounded-lg border border-border-strong px-3 text-fg hover:bg-surface-hover"
      >
        Cancel
      </button>
    </div>
  )
}
