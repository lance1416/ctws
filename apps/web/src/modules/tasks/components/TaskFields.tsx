import { TASK_STATUSES } from '@ctws/contracts'
import type { ReactNode } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { addDays } from '@ctws/core/day'
import { nextMonday } from '../../../platform/time/dates'
import { decision, label, STATUS_CHIP } from '../../../platform/ui/formStyles'
import { STATUS_LABEL } from '../logic/status'
import { StatusMark } from './StatusMark'
import { DeadlineMark, PlanMark } from './TaskRowParts'

// Fields the pane's form and the New task dialog both draw; each form keeps its own values.

/** The named days the date decisions offer, the same three the row's triage control offers. */
const namedDays = (
  today: string,
): readonly (readonly [shown: string, said: string, day: string])[] => [
  ['Today', 'today', today],
  ['Tomorrow', 'tomorrow', addDays(today, 1)],
  ['Mon', 'next week', nextMonday(today)],
]

/**
 * The statuses as native radios: one tab stop, arrow keys inside. Each input covers its whole
 * chip, so the chip is the radio.
 */
export function StatusRadios({
  id,
  field,
  bare = false,
}: {
  id: string
  field: UseFormRegisterReturn
  /** In a field row whose name says Status already: the label is for a screen reader only. */
  bare?: boolean
}) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-status-label`}>
      <span id={`${id}-status-label`} className={bare ? 'sr-only' : label}>
        Status
      </span>
      {/* Sized to the words and wrapped where they run out, so no label wraps inside its chip. */}
      <div className={`flex flex-wrap gap-1 ${bare ? 'py-1' : 'mt-1.5'}`}>
        {TASK_STATUSES.map((s) => (
          <label key={s} className={STATUS_CHIP}>
            <input
              type="radio"
              value={s}
              {...field}
              className="absolute inset-0 cursor-pointer appearance-none opacity-0"
            />
            {/* The radio is named by the word beside it; the mark saying it too would be twice. */}
            <span aria-hidden="true" className="flex">
              <StatusMark status={s} />
            </span>
            {STATUS_LABEL[s]}
          </label>
        ))}
      </div>
    </div>
  )
}

const DATE = {
  due: {
    tone: 'text-warn-t',
    mark: <DeadlineMark filled={false} />,
    word: 'Due',
    verb: 'Due',
    clear: 'Clear the deadline',
  },
  plan: {
    tone: 'text-go-t',
    mark: <PlanMark />,
    word: 'Plan',
    verb: 'Plan for',
    clear: 'Clear the plan',
  },
} as const

/**
 * One date as named decisions and the way out. `exact` is a field for any other day, named from the
 * heading by `htmlFor`; `pressed` marks the chosen day where the choice is a state.
 */
export function DateDecisions({
  kind,
  today,
  onDay,
  onClear,
  pressed,
  htmlFor,
  exact,
  echo,
  bare = false,
}: {
  kind: 'due' | 'plan'
  today: string
  onDay: (day: string) => void
  onClear: () => void
  pressed?: (day: string) => boolean
  htmlFor?: string
  exact?: ReactNode
  /** The chosen day said back in the app's words (`DateEcho`). */
  echo: string | null
  /** In a field row that names the date already: the heading is for a screen reader only. */
  bare?: boolean
}) {
  const d = DATE[kind]
  const heading = (
    <>
      {d.mark}
      {d.word}
    </>
  )
  const headingClass = bare ? 'sr-only' : `flex items-center gap-1 text-ui ${d.tone}`
  return (
    <div className={bare ? 'min-w-0 flex-1 py-1' : undefined}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={headingClass}>
          {heading}
        </label>
      ) : (
        <span className={headingClass}>{heading}</span>
      )}
      <div className={`flex flex-wrap gap-1 ${bare ? '' : 'mt-1.5'}`}>
        {/* Shown short, as Today's overdue row says them (DES-001 v1.20); named in full, so a
            form with two dates has two different Todays. */}
        {namedDays(today).map(([shown, said, day]) => (
          <button
            key={shown}
            type="button"
            aria-label={`${d.verb} ${said}`}
            aria-pressed={pressed?.(day)}
            onClick={() => onDay(day)}
            className={decision}
          >
            {shown}
          </button>
        ))}
        <button type="button" aria-label={d.clear} onClick={onClear} className={decision}>
          Clear
        </button>
      </div>
      {exact}
      <DateEcho text={echo} />
    </div>
  )
}

/**
 * The chosen day said back in the app's words ("Tomorrow, 14:30"): a native date input prints in
 * the browser's language, which the page cannot set.
 */
function DateEcho({ text }: { text: string | null }) {
  if (!text) return null
  return <p className="mt-1 text-meta tabular-nums text-muted">{text}</p>
}
