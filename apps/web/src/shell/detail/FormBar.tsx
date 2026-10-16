import { Button } from '../../platform/ui/Button'

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
      <Button look="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button look="primary" type="submit" disabled={busy || disabled}>
        Save
      </Button>
    </div>
  )
}
