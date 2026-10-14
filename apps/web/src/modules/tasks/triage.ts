import type { TodayTaskResponse } from '@ctws/contracts'
import type { TriageSection } from './components/TriageControl'
import { addDays, nextMonday } from '../../platform/time/dates'
import { moveDueToDay } from './dueDates'

/** Only what the decisions read. Anything that can answer this is a row this page shows. */
type Triageable = Pick<TodayTaskResponse, 'id' | 'segment' | 'dueAt'>

/** What a triage action writes. The page hands in the function that sends it. */
export type TriagePatch = { dueAt?: string | null; scheduledOn?: string | null }

/**
 * THE WAY OUT OF AN OVERDUE OR CARRIED ROW, as named decisions.
 *
 * Every action here is a DECISION a person recounts -- "push it to next Monday", "this is not a
 * deadline any more, it is a plan" -- rather than a field to fill in. That is why a calendar is
 * the wrong control for it: two of these change two fields at once, and the dates are computed
 * from today rather than chosen.
 *
 * TWO FIELDS IN ONE REQUEST where a decision touches both, so a row is never left half-way: a
 * task whose deadline was cleared but whose plan had not landed yet would have fallen off every
 * list the app has.
 *
 * `null` for a row with nothing to triage -- a task due later, or one planned for today. The row
 * then reserves the slot and draws no trigger (`TriageControl`), so nothing moves when one
 * appears beside it.
 */
export function triageSections(
  t: Triageable,
  /** The wording a carried plan shows, or null. The page works it out once per render. */
  carried: string | null,
  today: string,
  timeZone: string,
  patch: (id: string, body: TriagePatch) => void,
): TriageSection[] | null {
  const tomorrow = addDays(today, 1)
  const nextWeek = nextMonday(today)

  if (t.segment === 'overdue' && t.dueAt) {
    const due = t.dueAt
    return [
      {
        // The deadline stays a deadline and keeps its time of day: a 09:00 standup pushed to
        // tomorrow is still at 09:00.
        heading: 'Push the deadline',
        actions: [
          {
            label: 'To tomorrow',
            run: () => patch(t.id, { dueAt: moveDueToDay(due, tomorrow, timeZone) }),
          },
          {
            label: 'To next week',
            run: () => patch(t.id, { dueAt: moveDueToDay(due, nextWeek, timeZone) }),
          },
          { label: 'Clear the deadline', run: () => patch(t.id, { dueAt: null }) },
        ],
      },
      {
        // The deadline stops being one: nobody is waiting, so it becomes a plan.
        heading: 'Make it a plan',
        actions: [
          { label: 'Today', run: () => patch(t.id, { dueAt: null, scheduledOn: today }) },
          { label: 'Tomorrow', run: () => patch(t.id, { dueAt: null, scheduledOn: tomorrow }) },
          { label: 'Next week', run: () => patch(t.id, { dueAt: null, scheduledOn: nextWeek }) },
        ],
      },
    ]
  }

  if (carried) {
    return [
      {
        // The plan-side twin: it moves the PLAN and never touches the deadline.
        heading: null,
        actions: [
          { label: 'Move to today', run: () => patch(t.id, { scheduledOn: today }) },
          { label: 'Move to tomorrow', run: () => patch(t.id, { scheduledOn: tomorrow }) },
          { label: 'Move to next week', run: () => patch(t.id, { scheduledOn: nextWeek }) },
          { label: 'Clear the plan', run: () => patch(t.id, { scheduledOn: null }) },
        ],
      },
    ]
  }

  return null
}
