import type { EditScope } from '@ctws/contracts'
import { BUTTON } from '../../../platform/ui/buttonStyles'

/**
 * Asks whether a change to a repeating meeting is for this one or from here on, since neither can
 * be recovered from the other. Inline, not a modal, so what is being changed stays on screen.
 */
export function ScopeAsk({
  what,
  onPick,
  onCancel,
  destroys = false,
  back = 'Cancel',
}: {
  /** What the change is, in the question: "Move this meeting to …". */
  what: string
  onPick: (scope: EditScope) => void
  onCancel: () => void
  /** The answer cancels occurrences, so both answers wear the danger colour. */
  destroys?: boolean
  /** The way out's word. "Cancel" is wrong when the question is itself about cancelling. */
  back?: string
}) {
  const answer = destroys ? BUTTON.destructive : BUTTON.secondary
  return (
    <div
      role="alertdialog"
      aria-label="This meeting repeats"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
    >
      <p className="w-full text-ink">{what}</p>
      <span className="flex flex-wrap items-center gap-2">
        {/* When the answer destroys, focus starts on the way out, as on every delete: a held
            Enter that opened the question must not also answer it. */}
        <button autoFocus={destroys} type="button" onClick={onCancel} className={BUTTON.secondary}>
          {back}
        </button>
        {/* The two answers wrap as one pair, so neither ends up alone under the way out. */}
        <span className="flex items-center gap-2">
          <button
            autoFocus={!destroys}
            type="button"
            onClick={() => onPick('one')}
            className={answer}
          >
            Just this one
          </button>
          <button type="button" onClick={() => onPick('following')} className={answer}>
            This and all later
          </button>
        </span>
      </span>
    </div>
  )
}
