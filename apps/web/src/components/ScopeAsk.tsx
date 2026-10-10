import type { EditScope } from '@ctws/contracts'

/**
 * THIS ONE, OR FROM HERE ON -- what every calendar asks before changing a repeating event.
 *
 * It is asked rather than guessed because the two answers are not recoverable from one another:
 * changing the series when only this week moved is a mess to undo by hand, and the person is the
 * only one who knows which they meant. RFC 5545 has the same split (`RECURRENCE-ID` against the
 * series itself), so this is the data model surfacing, not a dialog invented for the occasion.
 *
 * Inline in the pane, never a modal: a browser dialog blocks this project's automation, and the
 * thing being changed should stay on screen while the question is answered.
 */
export function ScopeAsk({
  what,
  onPick,
  onCancel,
}: {
  /** What the change is, in the question: "Move this meeting to …". */
  what: string
  onPick: (scope: EditScope) => void
  onCancel: () => void
}) {
  return (
    <div
      role="alertdialog"
      aria-label="This meeting repeats"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border-subtle bg-surface px-2.5 py-2 text-sm"
    >
      <p className="w-full text-fg">{what}</p>
      <button
        autoFocus
        type="button"
        onClick={() => onPick('one')}
        className="h-9 rounded-lg border border-border-strong px-2.5 text-fg hover:bg-surface-hover"
      >
        Just this one
      </button>
      <button
        type="button"
        onClick={() => onPick('following')}
        className="h-9 rounded-lg border border-border-strong px-2.5 text-fg hover:bg-surface-hover"
      >
        This and all later
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="h-9 rounded-lg px-2 text-fg-muted hover:text-fg"
      >
        Cancel
      </button>
    </div>
  )
}
