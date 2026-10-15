import { BUTTON } from '../../platform/ui/buttonStyles'

/** "Editing", Cancel and Save, at the top of a pane's edit form. */
export function FormBar({
  busy,
  disabled = false,
  onCancel,
}: {
  busy: boolean
  disabled?: boolean
  onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-xs text-ink-muted">Editing</span>
      <button type="button" className={BUTTON.secondary} onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className={BUTTON.primary} disabled={busy || disabled}>
        Save
      </button>
    </div>
  )
}
