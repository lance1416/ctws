import { useRef } from 'react'
import type { EditScope } from '../api'
import { BottomSheet } from '../../../platform/ui/BottomSheet'
import { Button } from '../../../platform/ui/Button'
import { usePhone } from '../../../platform/ui/phone'

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
  return <Question {...ask} back={back} answer="secondary" first="answer" />
}

/**
 * Asks which occurrences of a repeating meeting to cancel. Both answers destroy, so they wear the
 * danger colour and focus starts on the way out, as on every delete: a held Enter that opened the
 * question must not also answer it.
 */
export function CancelScopeAsk(ask: Ask) {
  // "Cancel" would say the opposite of what the way out does here.
  return <Question {...ask} back="Keep it" answer="destructive" first="back" />
}

function Question({
  what,
  onPick,
  onCancel,
  back,
  answer,
  first,
}: Ask & { back: string; answer: 'secondary' | 'destructive'; first: 'back' | 'answer' }) {
  const phone = usePhone()
  const firstFocus = useRef<HTMLButtonElement>(null)
  // On a phone, a sheet from the foot: the question, then its answers full width, one over the
  // other, the way out last (DES-001).
  if (phone)
    return (
      <BottomSheet
        title="This meeting repeats"
        onClose={onCancel}
        initialFocus={firstFocus}
        close={false}
      >
        <div
          role="alertdialog"
          aria-label="This meeting repeats"
          className="flex flex-col gap-3 px-4 pt-1 pb-4 text-ui"
        >
          <p className="text-ink">{what}</p>
          <Button
            look={answer}
            ref={first === 'answer' ? firstFocus : undefined}
            onClick={() => onPick('one')}
            className="w-full justify-center"
          >
            Just this one
          </Button>
          <Button
            look={answer}
            onClick={() => onPick('following')}
            className="w-full justify-center"
          >
            This and all later
          </Button>
          <Button
            look="secondary"
            ref={first === 'back' ? firstFocus : undefined}
            onClick={onCancel}
            className="w-full justify-center"
          >
            {back}
          </Button>
        </div>
      </BottomSheet>
    )
  return (
    <div
      role="alertdialog"
      aria-label="This meeting repeats"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui"
    >
      <p className="w-full text-ink">{what}</p>
      <span className="flex flex-wrap items-center gap-2">
        <Button look="secondary" autoFocus={first === 'back'} onClick={onCancel}>
          {back}
        </Button>
        {/* The two answers wrap as one pair, so neither ends up alone under the way out. */}
        <span className="flex items-center gap-2">
          <Button look={answer} autoFocus={first === 'answer'} onClick={() => onPick('one')}>
            Just this one
          </Button>
          <Button look={answer} onClick={() => onPick('following')}>
            This and all later
          </Button>
        </span>
      </span>
    </div>
  )
}
