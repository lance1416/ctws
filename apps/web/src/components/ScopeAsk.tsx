import type { EditScope } from '@ctws/contracts'
import { BUTTON } from './buttonStyles'

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
  destroys = false,
  back = 'Cancel',
}: {
  /** What the change is, in the question: "Move this meeting to …". */
  what: string
  onPick: (scope: EditScope) => void
  onCancel: () => void
  /**
   * The answer CANCELS occurrences, rather than changing them: both answers wear the danger
   * colour, as every press that destroys does (`DangerZone`'s second rule).
   */
  destroys?: boolean
  /** The way out's word. "Cancel" is wrong when the question is itself about cancelling. */
  back?: string
}) {
  const answer = destroys ? BUTTON.destructive : BUTTON.secondary
  return (
    /*
      DRAWN LIKE THE DELETE QUESTION (`DeleteConfirm`): the sentence, then the way out, then the
      answers. It used to be a box in the page's ground colour -- a darker block inside the pane,
      and the one question of the two that looked unlike the other.
    */
    <div
      role="alertdialog"
      aria-label="This meeting repeats"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
    >
      <p className="w-full text-fg">{what}</p>
      <span className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onCancel} className={BUTTON.secondary}>
          {back}
        </button>
        {/* The two answers are one pair and wrap as one: in a 22rem pane the three buttons do
            not fit a line, and splitting the pair put "This and all later" alone under the way
            out. */}
        <span className="flex items-center gap-2">
          <button autoFocus type="button" onClick={() => onPick('one')} className={answer}>
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
