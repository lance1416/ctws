import type { EditScope } from '../api'
import { BUTTON } from '../../../platform/ui/buttonStyles'

type Ask = {
  /** What the change is, in the question: "Move this meeting to …". */
  what: string
  onPick: (scope: EditScope) => void
  onCancel: () => void
}

/**
 * Asks whether a change to a repeating meeting is for this one or from here on, since neither can
 * be recovered from the other. Inline, not a modal, so what is being changed stays on screen.
 */
export function ScopeAsk({
  back,
  ...ask
}: Ask & {
  /** The way out's word, told apart from the form's own Cancel under it. */
  back: string
}) {
  return <Question {...ask} back={back} answer={BUTTON.secondary} first="answer" />
}

/**
 * Asks which occurrences of a repeating meeting to cancel. Both answers destroy, so they wear the
 * danger colour and focus starts on the way out, as on every delete: a held Enter that opened the
 * question must not also answer it.
 */
export function CancelScopeAsk(ask: Ask) {
  // "Cancel" would say the opposite of what the way out does here.
  return <Question {...ask} back="Keep it" answer={BUTTON.destructive} first="back" />
}

function Question({
  what,
  onPick,
  onCancel,
  back,
  answer,
  first,
}: Ask & { back: string; answer: string; first: 'back' | 'answer' }) {
  return (
    <div
      role="alertdialog"
      aria-label="This meeting repeats"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
    >
      <p className="w-full text-ink">{what}</p>
      <span className="flex flex-wrap items-center gap-2">
        <button
          autoFocus={first === 'back'}
          type="button"
          onClick={onCancel}
          className={BUTTON.secondary}
        >
          {back}
        </button>
        {/* The two answers wrap as one pair, so neither ends up alone under the way out. */}
        <span className="flex items-center gap-2">
          <button
            autoFocus={first === 'answer'}
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
