import { TASK_STATUSES } from '@ctws/contracts'
import type { ReactNode } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { addDays, nextMonday } from '../../../platform/time/dates'
import { decision, label, STATUS_CHIP } from '../../../platform/ui/formStyles'
import { STATUS_LABEL } from '../status'
import { StatusMark } from './StatusMark'
import { DeadlineMark, PlanMark } from './TaskRowParts'

/**
 * The fields the task pane's form and the New task dialog both draw. They render and hold no
 * state: each form keeps its own values and says what a press does.
 */

/** The named days the date decisions offer, the same three the row's triage control offers. */
export const namedDays = (today: string): readonly (readonly [word: string, day: string])[] => [
  ['Today', today],
  ['Tomorrow', addDays(today, 1)],
  ['Next week', nextMonday(today)],
]

/**
 * The five marker shapes the rows speak, named, as native radios: one tab stop and the arrow keys
 * inside it, for free. Each input covers its whole chip, so the chip IS the radio.
 */
export function StatusRadios({ id, field }: { id: string; field: UseFormRegisterReturn }) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-status-label`}>
      <span id={`${id}-status-label`} className={label}>
        Status
      </span>
      {/* Sized to the words and wrapped where they run out (3 + 2): a fixed grid cut the longest
          label in half, and a label wrapping inside its chip makes that chip the odd one out. */}
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
 * One date as named decisions -- today, tomorrow, next week and the way out -- wearing the glyph
 * and colour family the rows wear. `exact` is a field for every other day, under the buttons;
 * `htmlFor` names it from the heading. `pressed` marks the chosen day where the choice is a state.
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
 * The chosen day and time said back the way the app says it ("Tomorrow, 14:30"). A native date
 * input prints its format in the browser's UI language, which the page cannot set; this is the
 * app saying which day it understood, right whatever the field prints.
 */
function DateEcho({ text }: { text: string | null }) {
  if (!text) return null
  return <p className="mt-1 text-xs tabular-nums text-ink-muted">{text}</p>
}
