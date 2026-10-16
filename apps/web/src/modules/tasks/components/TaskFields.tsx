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
const namedDays = (today: string): readonly (readonly [word: string, day: string])[] => [
  ['Today', today],
  ['Tomorrow', addDays(today, 1)],
  ['Next week', nextMonday(today)],
]

/**
 * The statuses as native radios: one tab stop, arrow keys inside. Each input covers its whole
 * chip, so the chip is the radio.
 */
export function StatusRadios({ id, field }: { id: string; field: UseFormRegisterReturn }) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-status-label`}>
      <span id={`${id}-status-label`} className={label}>
        Status
      </span>
      {/* Sized to the words and wrapped where they run out, so no label wraps inside its chip. */}
      <div className="mt-1.5 flex flex-wrap gap-1">
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
    tone: 'text-deadline',
    mark: <DeadlineMark filled={false} />,
    word: 'Due',
    verb: 'Due',
    clear: 'Clear the deadline',
  },
  plan: {
    tone: 'text-plan',
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
}) {
  const d = DATE[kind]
  const heading = (
    <>
      {d.mark}
      {d.word}
    </>
  )
  const headingClass = `flex items-center gap-1 text-sm ${d.tone}`
  return (
    <div>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={headingClass}>
          {heading}
        </label>
      ) : (
        <span className={headingClass}>{heading}</span>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {namedDays(today).map(([word, day]) => (
          <button
            key={word}
            type="button"
            aria-pressed={pressed?.(day)}
            onClick={() => onDay(day)}
            className={decision}
          >
            {d.verb} {word.toLowerCase()}
          </button>
        ))}
        <button type="button" onClick={onClear} className={decision}>
          {d.clear}
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
  return <p className="mt-1 text-xs tabular-nums text-ink-muted">{text}</p>
}
